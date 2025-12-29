from django.contrib.auth import get_user_model
from django.contrib.sites.models import Site
from django.core.management.base import BaseCommand
from django.utils import timezone

from learning.settings import StudentStatuses
from users.constants import GenderTypes, Roles
from users.models import StudentProfile, StudentTypes, UserGroup


class Command(BaseCommand):
    help = "Create/update the microvanuta (admin) and microstudent (student) demo accounts."

    def handle(self, *args, **options):
        site = Site.objects.get_current()
        user_model = get_user_model()

        accounts = [
            {
                "username": "microvanuta",
                "email": "microvanuta@example.com",
                "first_name": "Micro",
                "last_name": "Vanuta",
                "is_staff": True,
                "is_superuser": True,
                "roles": [Roles.CURATOR],
                "create_profile": False,
            },
            {
                "username": "microstudent",
                "email": "microstudent@example.com",
                "first_name": "Micro",
                "last_name": "Student",
                "is_staff": False,
                "is_superuser": False,
                "roles": [Roles.STUDENT],
                "create_profile": True,
                "profile_type": StudentTypes.INVITED,
            },
        ]

        password = "Keklol123"
        created_or_updated = 0

        for account in accounts:
            defaults = {
                "email": account["email"],
                "first_name": account["first_name"],
                "last_name": account["last_name"],
                "is_staff": account["is_staff"],
                "is_superuser": account["is_superuser"],
                "gender": GenderTypes.OTHER,
                "is_active": True,
            }
            user, created = user_model.objects.update_or_create(
                username=account["username"],
                defaults=defaults,
            )
            user.set_password(password)
            user.save(update_fields=["password"])

            for role in account["roles"]:
                UserGroup.objects.update_or_create(
                    user=user,
                    site=site,
                    role=role,
                )

            if account.get("create_profile"):
                StudentProfile.objects.update_or_create(
                    user=user,
                    type=account.get("profile_type", StudentTypes.INVITED),
                    defaults={
                        "status": StudentStatuses.NORMAL,
                        "year_of_admission": timezone.now().year,
                        "student_id": "",
                        "comment": "",
                    },
                )
            created_or_updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Ensured {created_or_updated} test accounts exist (password reset to '{password}')."
            )
        )
