from __future__ import annotations

from collections.abc import Iterable

from .models import ActionType, OrderPositionAction, User


def action_type_value(action_type: ActionType | str) -> str:
    return action_type.value if hasattr(action_type, "value") else str(action_type)


def user_can_perform_action(user: User, action_type: ActionType | str) -> bool:
    allowed = user.allowed_action_types or []
    allowed_values = {
        item.value if hasattr(item, "value") else str(item)
        for item in allowed
    }
    return action_type_value(action_type) in allowed_values


def normalize_assigned_worker_ids(
    actor_id: int,
    shared_worker_ids: Iterable[int] | None,
) -> list[int]:
    ordered_ids = [actor_id]
    seen_ids = {actor_id}

    for worker_id in shared_worker_ids or []:
        if worker_id in seen_ids:
            continue
        seen_ids.add(worker_id)
        ordered_ids.append(worker_id)

    return ordered_ids


def get_action_workers(action: OrderPositionAction) -> list[User]:
    workers_by_id: dict[int, User] = {}

    if action.actor is not None:
        workers_by_id[action.actor_id] = action.actor

    for assignment in getattr(action, "worker_assignments", []) or []:
        if assignment.user is None:
            continue
        workers_by_id[assignment.user_id] = assignment.user

    if not workers_by_id:
        return []

    ordered_workers: list[User] = []
    actor = workers_by_id.pop(action.actor_id, None)
    if actor is not None:
        ordered_workers.append(actor)

    ordered_workers.extend(
        sorted(
            workers_by_id.values(),
            key=lambda user: (user.first_name.lower(), user.last_name.lower(), user.id),
        )
    )
    return ordered_workers


def get_action_worker_ids(action: OrderPositionAction) -> list[int]:
    return [worker.id for worker in get_action_workers(action)]


def get_action_worker_names(action: OrderPositionAction) -> list[str]:
    return [worker.name for worker in get_action_workers(action)]


def get_action_worker_count(action: OrderPositionAction) -> int:
    return max(len(get_action_workers(action)), 1)


def get_action_cost_share(action: OrderPositionAction) -> float:
    return (action.cost or 0.0) / get_action_worker_count(action)
