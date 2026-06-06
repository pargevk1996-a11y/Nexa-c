from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["web", "fcm", "apns", "desktop"]


class NotificationPreferencesBody(BaseModel):
    mute_until: datetime | None = None
    mute_all: bool = False
    mentions_only: bool = False
    push_enabled: bool = True
    desktop_enabled: bool = True
    mobile_enabled: bool = True
    preview: bool = True
    sound: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    group_notifications: bool = True


class NotificationPreferencesResponse(NotificationPreferencesBody):
    user_id: str
    conversation_id: str | None = None


class PushSubscriptionCreate(BaseModel):
    platform: Platform
    endpoint: str
    keys: dict | None = None
    device_name: str | None = None


class PushSubscriptionResponse(BaseModel):
    id: str
    platform: Platform
    endpoint: str
    device_name: str | None = None
    created_at: datetime


class DispatchNotificationRequest(BaseModel):
    conversation_id: str
    message_id: str
    sender_id: str
    sender_name: str = "Someone"
    body_preview: str = ""
    silent: bool = False
    mention_user_ids: list[str] = Field(default_factory=list)
    target_user_ids: list[str] = Field(min_length=1)
    conversation_title: str | None = None


class DispatchNotificationResponse(BaseModel):
    queued: int
    suppressed: int
    grouped: int


class NotificationOutboxItem(BaseModel):
    id: int
    platform: Platform
    collapse_key: str | None
    group_count: int
    payload: dict
    silent: bool
    status: str
    created_at: datetime
