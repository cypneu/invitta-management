from .models import OrderStatus


LEGACY_FETCHED_STATUS = "fetched"


def normalize_order_status(value: object) -> str:
    if isinstance(value, OrderStatus):
        raw_value = value.value
    else:
        raw_value = str(value)

    if raw_value == LEGACY_FETCHED_STATUS:
        return OrderStatus.in_progress.value

    return raw_value
