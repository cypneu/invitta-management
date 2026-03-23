INVITTA_SHOP_SOURCE = "sklep - invitta"
ALLEGRO_SOURCE_PREFIX = "allegro - "


def should_preserve_source_label(source: str | None) -> bool:
    if source is None:
        return False

    cleaned = source.strip()
    if not cleaned:
        return False

    lowered = cleaned.casefold()
    return lowered == INVITTA_SHOP_SOURCE or lowered.startswith(ALLEGRO_SOURCE_PREFIX)


def normalize_order_source(source: str | None, integration: str | None = None) -> str | None:
    if source is None:
        return None

    cleaned = source.strip()
    if not cleaned:
        return None

    if integration == "invitta" and cleaned.casefold() == "shop":
        return INVITTA_SHOP_SOURCE

    if should_preserve_source_label(cleaned):
        return cleaned

    if " - " in cleaned:
        return cleaned.split(" - ", 1)[0].strip() or cleaned

    return cleaned


def is_invitta_shop_source(source: str | None) -> bool:
    if source is None:
        return False
    return source.strip().casefold() in {"shop", INVITTA_SHOP_SOURCE}
