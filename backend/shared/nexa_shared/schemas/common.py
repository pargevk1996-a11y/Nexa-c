
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorDetail

    @classmethod
    def from_code(cls, code: str, message: str, details: list[str] | None = None) -> "ErrorResponse":
        return cls(error=ErrorDetail(code=code, message=message, details=details or []))
