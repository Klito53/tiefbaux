"""Background-Scheduler für tägliche Ausschreibungssuche."""

from __future__ import annotations

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import SessionLocal
from .tender_crawler import refresh_tenders

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _daily_tender_crawl():
    """Job: Holt neue Ausschreibungen von TED."""
    logger.info("Scheduled tender crawl starting...")
    db = SessionLocal()
    try:
        result = refresh_tenders(db)
        logger.info("Scheduled crawl done: %s", result)
    except Exception as e:
        logger.error("Scheduled crawl failed: %s", e)
    finally:
        db.close()


def start_scheduler():
    """Startet den Background-Scheduler mit täglichem Crawl um 6:00."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _daily_tender_crawl,
        trigger=CronTrigger(hour=6, minute=0),
        id="daily_tender_crawl",
        name="Tägliche Ausschreibungssuche",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler started — daily tender crawl at 06:00")


def stop_scheduler():
    """Stoppt den Scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")
