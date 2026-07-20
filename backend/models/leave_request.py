import datetime
from sqlalchemy import Column, Integer, String, Enum, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.config.database import Base

class LeaveRequest(Base):
    __tablename__ = "LeaveRequests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    userId = Column(Integer, ForeignKey("Users.id", ondelete="CASCADE"), nullable=False)
    startDate = Column(Date, nullable=False)
    endDate = Column(Date, nullable=False)
    type = Column(Enum("Sick", "Casual", "Earned", "Other"), nullable=False, default="Casual")
    reason = Column(Text, nullable=False)
    status = Column(Enum("Pending", "Approved", "Rejected"), nullable=False, default="Pending")
    hrNotes = Column(String(255), nullable=True)

    # Sequelize timestamps
    createdAt = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="leave_requests")
