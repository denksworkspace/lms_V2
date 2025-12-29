import os
from io import BytesIO
from urllib.parse import urlparse

import pytest
from PIL import Image
from pytest_django.lazy_django import skip_if_no_django

# Allow Django sync DB calls even if an event loop exists (Playwright/asyncio).
# This fixes teardown crashes like:
# SynchronousOnlyOperation: You cannot call this from an async context
@pytest.fixture(scope="session", autouse=True)
def _allow_django_in_async_context():
    # Needed because Playwright sync API uses an asyncio loop internally
    os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "true")

from django.contrib.sites.models import Site
from django.core.files import File
from django.db import connection, transaction
from django.test import TestCase
from django.urls import resolve

from core.models import SiteConfiguration
from core.tests.factories import CityFactory, SiteConfigurationFactory, SiteFactory
# noinspection PyUnresolvedReferences
from core.tests.fixtures import (
    university_cub, program_cub001, program_run_cub,
    university_nup, program_nup001, program_run_nup
)
from core.tests.settings import (
    ANOTHER_DOMAIN, ANOTHER_DOMAIN_ID, TEST_DOMAIN, TEST_DOMAIN_ID
)
from core.tests.utils import TestClient
from courses.models import CourseProgramBinding, Course, MetaCourse
from notifications.models import Type
from users.tests.factories import CuratorFactory


@pytest.fixture()
def client():
    """Customized Django test client with a custom login method."""
    skip_if_no_django()
    return TestClient()


@pytest.fixture(scope="session")
def assert_redirect():
    """Wrapper around Django TestCase.assertRedirects with fetch_redirect_response disabled."""
    _tc = TestCase()

    def wrapper(*args, **kwargs):
        # `fetch_redirect_response` breaks if expected_url is absolute.
        # Django test client stores redirect locations as relative URLs.
        kwargs["fetch_redirect_response"] = False
        return _tc.assertRedirects(*args, **kwargs)

    return wrapper


@pytest.fixture(scope="function")
def assert_login_redirect(client, settings, assert_redirect):
    """
    Assert that an unauthenticated request is redirected to LOGIN_URL with next=<path>.
    """
    def wrapper(url, form=None, **kwargs):
        method_name = kwargs.pop("method", "get")
        client_method = getattr(client, method_name)

        path = urlparse(url).path
        expected_path = f"{settings.LOGIN_URL}?next={path}"

        response = client_method(url, form, **kwargs)
        assert_redirect(response, expected_path)

    return wrapper


@pytest.fixture(scope="function")
def curator():
    """
    Create a curator. Note: sequences are reset per test, so do not rely on IDs.
    """
    return CuratorFactory(
        email="curators@test.ru",
        first_name="Global",
        username="curator",
        last_name="Curator",
    )


@pytest.fixture(scope="session")
def get_test_image():
    """
    Create an in-memory image for tests.
    """
    def wrapper(name="test.png", size=(50, 50), color=(255, 0, 0, 255)):
        file_obj = BytesIO()
        _, ext = name.rsplit(".", maxsplit=1)
        ext_lower = ext.lower()

        # PIL expects format names like "PNG", "JPEG", etc.
        format_by_ext = {
            "png": "PNG",
            "jpg": "JPEG",
            "jpeg": "JPEG",
            "webp": "WEBP",
        }
        img_format = format_by_ext.get(ext_lower, ext_upper := ext.upper())

        image = Image.new("RGBA", size=size, color=color)
        image.save(file_obj, format=img_format)
        file_obj.seek(0)
        return File(file_obj, name=name)

    return wrapper


@pytest.fixture(scope="function")
def lms_resolver():
    """
    Resolve URL using lms.urls urlconf.
    """
    def wrapper(url):
        rel_url = urlparse(url).path
        return resolve(rel_url, urlconf="lms.urls")

    return wrapper


@pytest.fixture(scope="session", autouse=True)
def _prepopulate_db_with_data(django_db_setup, django_db_blocker):
    """
    Populate the test database with required baseline data.

    Some tests rely on data that might have been created by old data migrations.
    This fixture restores the required entities in one place.
    """
    with django_db_blocker.unblock():
        with transaction.atomic():
            CourseProgramBinding.objects.all().delete()
            Course.objects.all().delete()
            MetaCourse.objects.all().delete()
            SiteConfiguration.objects.all().delete()

            domains = [
                (TEST_DOMAIN_ID, TEST_DOMAIN),
                (ANOTHER_DOMAIN_ID, ANOTHER_DOMAIN),
            ]

            sites_by_domain = {}
            for site_id, domain in domains:
                site, _ = Site.objects.update_or_create(
                    id=site_id,
                    defaults={"domain": domain, "name": domain},
                )
                sites_by_domain[domain] = site

            # Reset sequences for Site (important when IDs are forced).
            from django.core.management.color import no_style
            sequence_sql = connection.ops.sequence_reset_sql(no_style(), [Site])
            with connection.cursor() as cursor:
                for sql in sequence_sql:
                    cursor.execute(sql)

            site1 = sites_by_domain[TEST_DOMAIN]
            site2 = sites_by_domain[ANOTHER_DOMAIN]

            SiteConfigurationFactory(site=site1)
            SiteConfigurationFactory(site=site2)

            # Notification types
            from notifications import NotificationTypes
            for t in NotificationTypes:
                Type.objects.update_or_create(
                    id=t.value,
                    defaults={"code": t.name},
                )
