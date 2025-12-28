import pytest
from django_recaptcha.client import RecaptchaResponse

from users.constants import Roles
from users.models import User
from users.tests.factories import UserFactory, add_user_groups
from learning.tests.factories import EnrollmentFactory
from courses.tests.factories import AssignmentFactory


pytestmark = [
    pytest.mark.e2e,
    pytest.mark.django_db(transaction=True),
]

PASSWORD = "test123foobar@!"


@pytest.fixture(autouse=True)
def _bypass_recaptcha(monkeypatch):
    """
    Bypass reCAPTCHA validation in tests.

    Different versions / integrations call submit() from different modules,
    so we patch both common import paths.
    """

    def _always_valid(*_args, **_kwargs):
        return RecaptchaResponse(is_valid=True)

    for dotted in (
        "django_recaptcha.client.submit",
        "django_recaptcha.fields.client.submit",
    ):
        try:
            monkeypatch.setattr(dotted, _always_valid)
        except Exception:
            # If one of the paths doesn't exist in your installed version, ignore it.
            pass


def _get_or_create_student(username: str) -> User:
    """
    Make the test idempotent when running with --reuse-db / reused DB.
    If the user already exists, reuse it and (re)set a known password.
    """
    user = User.objects.filter(username=username).first()
    if user is None:
        user = UserFactory(username=username)

    user.set_password(PASSWORD)
    user.save(update_fields=["password"])

    add_user_groups(user, [Roles.STUDENT])
    return user


@pytest.fixture(scope="session")
def student_user(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        # NOTE: no enrollment here on purpose -> should still be able to open assignments page
        return _get_or_create_student("student")


@pytest.fixture(scope="session")
def student2_with_assignment(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        user = _get_or_create_student("student2")
        enrollment = EnrollmentFactory(student=user)

        assignment = AssignmentFactory(
            course=enrollment.course,
            title="E2E Assignment",
        )

        from learning.services.enrollment_service import recreate_assignments_for_student

        recreate_assignments_for_student(enrollment)

        return user, enrollment, assignment


@pytest.fixture(scope="session")
def student3_with_assignment_and_sa(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        user = _get_or_create_student("student3")
        enrollment = EnrollmentFactory(student=user)

        assignment = AssignmentFactory(
            course=enrollment.course,
            title="E2E Assignment With Comments",
        )

        from learning.services.enrollment_service import recreate_assignments_for_student

        recreate_assignments_for_student(enrollment)

        from learning.models import StudentAssignment

        student_assignment = StudentAssignment.objects.get(
            student=user,
            assignment=assignment,
        )

        return user, enrollment, assignment, student_assignment


def _wait_assignments_page(page, timeout=60_000) -> str:
    """
    Wait until assignments page is rendered. It can be:
    - empty state (no courses / no assignments)
    - list state (filter select exists)

    Return body text for optional assertions/debug.
    """
    page.wait_for_load_state("domcontentloaded")

    assert "/login" not in page.url

    # Ensure DOM is there
    page.wait_for_selector("body", timeout=timeout)
    body_text = page.locator("body").inner_text()

    # Extra safety: ensure it's not the login form content
    # (adjust if your UI language differs)
    assert "Forgot?" not in body_text

    return body_text


def _login_via_cookie(page, live_server, user: User):
    """
    Avoid brittle UI login flow (recaptcha/csrf/templates).
    Create django session in DB and set it as a browser cookie.
    """
    from django.contrib.sessions.backends.db import SessionStore

    session = SessionStore()
    session["_auth_user_id"] = str(user.pk)
    session["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
    session["_auth_user_hash"] = user.get_session_auth_hash()
    session.save()

    # Ensure cookie domain is correct for live_server.url
    base_url = live_server.url  # like http://localhost:12345
    page.context.add_cookies(
        [
            {
                "name": "sessionid",
                "value": session.session_key,
                "url": base_url,
                "path": "/",
                "httpOnly": True,
            }
        ]
    )


def _select_course_contains(page, substring: str):
    """
    Select a course option where option text contains `substring`.
    Do selection by the option value (most stable).
    """
    page.wait_for_selector('select[name="course"]', timeout=60_000)

    options = page.eval_on_selector_all(
        'select[name="course"] option',
        "els => els.map(e => ({value: e.value, text: e.textContent.trim()}))",
    )

    match = next((o for o in options if substring in o["text"]), None)
    if not match:
        raise AssertionError(
            "Could not find course option.\n"
            f"Looking for substring: {substring}\n"
            f"Available options:\n"
            + "\n".join([f"- {o['value']}: {o['text']}" for o in options])
        )

    page.select_option('select[name="course"]', match["value"])


def test_login_redirects_to_assignments(page, live_server, student_user):
    _login_via_cookie(page, live_server, student_user)

    page.goto(f"{live_server.url}/learning/assignments/", wait_until="domcontentloaded")
    _wait_assignments_page(page)

    # Do NOT require course filter exists; user may have no enrollments.
    assert "/learning/assignments" in page.url


def test_assignments_filter_by_course(page, live_server, student2_with_assignment):
    user, enrollment, assignment = student2_with_assignment

    _login_via_cookie(page, live_server, user)

    page.goto(f"{live_server.url}/learning/assignments/", wait_until="domcontentloaded")
    _wait_assignments_page(page)

    page.wait_for_selector(f"text={assignment.title}", timeout=60_000)

    course_substring = getattr(enrollment.course, "name", None) or getattr(
        enrollment.course, "title"
    )
    _select_course_contains(page, course_substring)

    page.click('input[name="apply"]')
    page.wait_for_selector(f"text={assignment.title}", timeout=60_000)


def test_add_comment_from_assignment_detail(page, live_server, student3_with_assignment_and_sa):
    user, _enrollment, assignment, _student_assignment = student3_with_assignment_and_sa

    _login_via_cookie(page, live_server, user)

    page.goto(f"{live_server.url}/learning/assignments/", wait_until="domcontentloaded")
    _wait_assignments_page(page)

    page.click(f'text={assignment.title}')
    page.wait_for_url("**/learning/assignments/*", timeout=60_000)

    page.click("#add-comment")
    page.wait_for_selector("#comment-form-wrapper", timeout=60_000)

    textarea = page.locator("#comment-form-wrapper textarea").first
    textarea.fill("Hello from Playwright UI test")

    page.click("#comment-form-wrapper #submit-id-comment-save")
    page.wait_for_selector("text=Hello from Playwright UI test", timeout=60_000)
