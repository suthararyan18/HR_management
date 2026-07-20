import datetime
from sqlalchemy import Column, Integer, String, Enum, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.config.database import Base

class Attendance(Base):
    __tablename__ = "Attendances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    userId = Column(Integer, ForeignKey("Users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, default=datetime.date.today)
    checkIn = Column(DateTime, nullable=True)
    checkOut = Column(DateTime, nullable=True)
    status = Column(Enum("Present", "Late", "Absent"), nullable=False, default="Present")
    checkInIp = Column(String(255), nullable=True)
    notes = Column(String(255), nullable=True)
    breakStart = Column(DateTime, nullable=True)
    totalBreakTime = Column(Integer, nullable=False, default=0)

    # Sequelize timestamps
    createdAt = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="attendances")
