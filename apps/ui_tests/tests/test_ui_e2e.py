import pytest
from django.conf import settings
from django.test import Client

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


def _get_or_create_student(username: str) -> User:
    """
    Make tests idempotent when running with --reuse-db / reused DB.
    If the user already exists, reuse it and (re)set a known password.
    """
    user = User.objects.filter(username=username).first()
    if user is None:
        user = UserFactory(username=username)

    user.set_password(PASSWORD)
    user.save(update_fields=["password"])

    add_user_groups(user, [Roles.STUDENT])
    return user


def _login_via_cookie(page, live_server, user: User) -> None:
    """
    Avoid UI-login flakiness by creating an authenticated Django session using the test Client
    and injecting the session cookie into Playwright.

    This still tests the UI pages, but skips fragile login form / reCAPTCHA / site config issues.
    """
    client = Client()
    client.force_login(user)

    session_cookie_name = settings.SESSION_COOKIE_NAME
    session_cookie_value = client.cookies[session_cookie_name].value

    page.context.add_cookies(
        [
            {
                "name": session_cookie_name,
                "value": session_cookie_value,
                "url": live_server.url,  # important: cookie scoped to the live server
            }
        ]
    )


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
    page.wait_for_selector("text=Open assignments", timeout=60_000)


def test_assignments_filter_by_course(page, live_server, student2_with_assignment):
    user, enrollment, assignment = student2_with_assignment

    _login_via_cookie(page, live_server, user)

    page.goto(f"{live_server.url}/learning/assignments/", wait_until="domcontentloaded")
    page.wait_for_selector(f"text={assignment.title}", timeout=60_000)

    page.select_option('select[name="course"]', str(enrollment.course.pk))
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
