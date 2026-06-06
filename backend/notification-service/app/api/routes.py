from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user_id, verify_internal_secret
from app.schemas.notifications import (
    DispatchNotificationRequest,
    DispatchNotificationResponse,
    NotificationOutboxItem,
    NotificationPreferencesBody,
    NotificationPreferencesResponse,
    PushSubscriptionCreate,
    PushSubscriptionResponse,
)
from app.services.dispatcher import dispatch_message_notifications
from app.services.notification_store import notification_store

router = APIRouter(prefix="/api/v1/notifications")


def _pref_response(pref) -> NotificationPreferencesResponse:
    return NotificationPreferencesResponse(
        user_id=pref.user_id,
        conversation_id=pref.conversation_id,
        mute_until=pref.mute_until,
        mute_all=pref.mute_all,
        mentions_only=pref.mentions_only,
        push_enabled=pref.push_enabled,
        desktop_enabled=pref.desktop_enabled,
        mobile_enabled=pref.mobile_enabled,
        preview=pref.preview,
        sound=pref.sound,
        quiet_hours_enabled=pref.quiet_hours_enabled,
        quiet_hours_start=pref.quiet_hours_start,
        quiet_hours_end=pref.quiet_hours_end,
        group_notifications=pref.group_notifications,
    )


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_global_preferences(user_id: str = Depends(get_current_user_id)) -> NotificationPreferencesResponse:
    return _pref_response(notification_store.get_preferences(user_id, None))


@router.put("/preferences", response_model=NotificationPreferencesResponse)
async def put_global_preferences(
    body: NotificationPreferencesBody,
    user_id: str = Depends(get_current_user_id),
) -> NotificationPreferencesResponse:
    pref = notification_store.upsert_preferences(user_id, None, **body.model_dump(exclude_unset=True))
    return _pref_response(pref)


@router.get("/preferences/{conversation_id}", response_model=NotificationPreferencesResponse)
async def get_chat_preferences(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
) -> NotificationPreferencesResponse:
    return _pref_response(notification_store.get_preferences(user_id, conversation_id))


@router.put("/preferences/{conversation_id}", response_model=NotificationPreferencesResponse)
async def put_chat_preferences(
    conversation_id: str,
    body: NotificationPreferencesBody,
    user_id: str = Depends(get_current_user_id),
) -> NotificationPreferencesResponse:
    pref = notification_store.upsert_preferences(
        user_id, conversation_id, **body.model_dump(exclude_unset=True)
    )
    return _pref_response(pref)


@router.get("/subscriptions", response_model=list[PushSubscriptionResponse])
async def list_subscriptions(user_id: str = Depends(get_current_user_id)) -> list[PushSubscriptionResponse]:
    return [
        PushSubscriptionResponse(
            id=s.id,
            platform=s.platform,
            endpoint=s.endpoint,
            device_name=s.device_name,
            created_at=s.created_at,
        )
        for s in notification_store.list_subscriptions(user_id)
    ]


@router.post("/subscriptions", response_model=PushSubscriptionResponse)
async def register_subscription(
    body: PushSubscriptionCreate,
    user_id: str = Depends(get_current_user_id),
) -> PushSubscriptionResponse:
    sub = notification_store.add_subscription(
        user_id,
        platform=body.platform,
        endpoint=body.endpoint,
        keys=body.keys,
        device_name=body.device_name,
    )
    return PushSubscriptionResponse(
        id=sub.id,
        platform=sub.platform,
        endpoint=sub.endpoint,
        device_name=sub.device_name,
        created_at=sub.created_at,
    )


@router.delete("/subscriptions/{subscription_id}")
async def delete_subscription(
    subscription_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, bool]:
    if not notification_store.remove_subscription(user_id, subscription_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Subscription not found"}})
    return {"ok": True}


@router.get("/outbox", response_model=list[NotificationOutboxItem])
async def list_outbox(
    user_id: str = Depends(get_current_user_id),
) -> list[NotificationOutboxItem]:
    return [
        NotificationOutboxItem(
            id=r.id,
            platform=r.platform,
            collapse_key=r.collapse_key,
            group_count=r.group_count,
            payload=r.payload,
            silent=r.silent,
            status=r.status,
            created_at=r.created_at,
        )
        for r in notification_store.pending_outbox(user_id)
    ]


@router.post(
    "/internal/dispatch",
    response_model=DispatchNotificationResponse,
    dependencies=[Depends(verify_internal_secret)],
)
async def internal_dispatch(body: DispatchNotificationRequest) -> DispatchNotificationResponse:
    return await dispatch_message_notifications(body)
