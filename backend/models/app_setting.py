from sqlalchemy import Column, String
from backend.config.database import Base

class AppSetting(Base):
    __tablename__ = "AppSettings"

    key = Column(String(255), primary_key=True)
    value = Column(String(255), nullable=False)
