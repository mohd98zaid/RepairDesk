from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared application-wide rate limiter singleton
limiter = Limiter(key_func=get_remote_address)
