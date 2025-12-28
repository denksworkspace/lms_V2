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
            # If one of the paths doesn't exist in your installed version,
            # ignore it and keep going.
            pass


def _ui_login(page, base_url: str, username: str, password: str):
    """
    Log in via UI and wait for redirect to assignments.
    If login fails, raise with a helpful message instead of timing out.
    """
    page.goto(f"{base_url}/login/", wait_until="domcontentloaded")

    page.fill('input[name="username"]', username)
    page.fill('input[name="password"]', password)

    # Some templates include a hidden textarea for reCAPTCHA.
    page.evaluate(
        """
        () => {
          const el = document.querySelector('[name="g-recaptcha-response"]');
          if (el) el.value = 'e2e-test';
        }
        """
    )

    page.click('input[type="submit"]')

    # Wait for something to happen; 'load' can be flaky with heavy assets.
    page.wait_for_load_state("domcontentloaded")

    # If we stayed on /login/ => show the error text to debug quickly.
    if "/login" in page.url:
        body_text = page.locator("body").inner_text()
        raise AssertionError(
            f"Login failed (still on {page.url}). "
            f"Page text (first 2000 chars):\n\n{body_text[:2000]}"
        )

    page.wait_for_url("**/learning/assignments/**", timeout=60_000)


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
    _ui_login(page, live_server.url, student_user.username, PASSWORD)
    page.wait_for_selector("text=Open assignments", timeout=60_000)


def test_assignments_filter_by_course(page, live_server, student2_with_assignment):
    user, enrollment, assignment = student2_with_assignment

    _ui_login(page, live_server.url, user.username, PASSWORD)
    page.wait_for_selector(f"text={assignment.title}", timeout=60_000)

    page.select_option('select[name="course"]', str(enrollment.course.pk))
    page.click('input[name="apply"]')
    page.wait_for_selector(f"text={assignment.title}", timeout=60_000)


def test_add_comment_from_assignment_detail(page, live_server, student3_with_assignment_and_sa):
    user, _enrollment, assignment, _student_assignment = student3_with_assignment_and_sa

    _ui_login(page, live_server.url, user.username, PASSWORD)

    page.click(f'text={assignment.title}')
    page.wait_for_url("**/learning/assignments/*", timeout=60_000)

    page.click("#add-comment")
    page.wait_for_selector("#comment-form-wrapper", timeout=60_000)

    textarea = page.locator("#comment-form-wrapper textarea").first
    textarea.fill("Hello from Playwright UI test")

    page.click("#comment-form-wrapper #submit-id-comment-save")
    page.wait_for_selector("text=Hello from Playwright UI test", timeout=60_000)
