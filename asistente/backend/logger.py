"""No console/file diagnostic logging in the consumer application."""
import logging
logging.disable(logging.CRITICAL)
logger = logging.getLogger("assistant")
logger.addHandler(logging.NullHandler())
logger.propagate = False
