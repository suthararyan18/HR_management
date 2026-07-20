import datetime
from sqlalchemy import Column, Integer, String, Enum, Date, Boolean, DateTime
from sqlalchemy.orm import relationship
from backend.config.database import Base

class User(Base):
    __tablename__ = "Users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password = Column(String(255), nullable=False)
    role = Column(Enum("employee", "hr"), nullable=False, default="employee")
    department = Column(String(255), nullable=True, default="General")
    designation = Column(String(255), nullable=True, default="Staff Member")
    joinedDate = Column(Date, nullable=False, default=datetime.date.today)
    isActive = Column(Boolean, nullable=False, default=True)
    
    # Sequelize timestamps
    createdAt = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    attendances = relationship("Attendance", back_populates="user", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="user", cascade="all, delete-orphan")
