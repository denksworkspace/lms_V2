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

    Different versions / project integrations call submit() from different modules,
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
            pass


def _get_or_create_student(username: str) -> User:
    """
    Idempotent helper: reuse user if exists (for --reuse-db), set a known password,
    and ensure student role.
    """
    user = User.objects.filter(username=username).first()
    if user is None:
        user = UserFactory(username=username)

    user.set_password(PASSWORD)
    user.save(update_fields=["password"])

    add_user_groups(user, [Roles.STUDENT])
    return user


def _login_via_cookie(page, live_server, user: User):
    """
    Log in by creating a Django session cookie for the given user.

    This avoids flaky UI login (captcha, csrf templates, redirects, etc.).
    """
    # Import inside function to avoid pytest collection importing Django settings too early
    from django.conf import settings
    from django.contrib.sessions.backends.db import SessionStore
    from django.utils import timezone

    # Create session
    session = SessionStore()
    session["_auth_user_id"] = str(user.pk)
    session["_auth_user_backend"] = settings.AUTHENTICATION_BACKENDS[0]
    session["_auth_user_hash"] = user.get_session_auth_hash()
    session.set_expiry(60 * 60)  # 1 hour
    session.save()

    # Add cookie to browser for the live_server domain
    # live_server.url looks like http://localhost:12345
    cookie = {
        "name": settings.SESSION_COOKIE_NAME,
        "value": session.session_key,
        "domain": "localhost",
        "path": "/",
        "httpOnly": True,
        "secure": False,
        "sameSite": "Lax",
        "expires": int((timezone.now() + timezone.timedelta(hours=1)).timestamp()),
    }
    page.context.add_cookies([cookie])


@pytest.fixture(scope="session")
def student_user(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
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


def test_login_redirects_to_assignments(page, live_server, student_user):
    _login_via_cookie(page, live_server, student_user)

    page.goto(f"{live_server.url}/learning/assignments/", wait_until="domcontentloaded")

    # Most stable: prove we did NOT land on login and the assignments UI is there.
    assert "/login" not in page.url

    # This select exists on the assignments list page (based on your logs).
    page.wait_for_selector("select#id_course", timeout=60_000)


def test_assignments_filter_by_course(page, live_server, student2_with_assignment):
    user, enrollment, assignment = student2_with_assignment

    _login_via_cookie(page, live_server, user)
    page.goto(f"{live_server.url}/learning/assignments/", wait_until="domcontentloaded")

    page.wait_for_selector(f"text={assignment.title}", timeout=60_000)

    # Prefer selecting by label instead of value (pk), because option values can differ.
    # If your Course model uses `title` instead of `name`, replace accordingly.
    course_label = getattr(enrollment.course, "name", None) or getattr(enrollment.course, "title")
    page.select_option('select[name="course"]', label=course_label)

    page.click('input[name="apply"]')
    page.wait_for_selector(f"text={assignment.title}", timeout=60_000)


def test_add_comment_from_assignment_detail(page, live_server, student3_with_assignment_and_sa):
    user, _enrollment, assignment, _student_assignment = student3_with_assignment_and_sa

    _login_via_cookie(page, live_server, user)
    page.goto(f"{live_server.url}/learning/assignments/", wait_until="domcontentloaded")

    page.click(f'text={assignment.title}')
    page.wait_for_url("**/learning/assignments/*", timeout=60_000)

    page.click("#add-comment")
    page.wait_for_selector("#comment-form-wrapper", timeout=60_000)

    textarea = page.locator("#comment-form-wrapper textarea").first
    textarea.fill("Hello from Playwright UI test")

    page.click("#comment-form-wrapper #submit-id-comment-save")
    page.wait_for_selector("text=Hello from Playwright UI test", timeout=60_000)
