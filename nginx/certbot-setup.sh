#!/bin/bash

# Минимальный скрипт для настройки SSL с certbot
# Предполагается, что сайт уже работает на HTTP

set -e

DOMAIN="calc.aicolab.space"
EMAIL="admin@aicolab.space"

echo "Настройка SSL для $DOMAIN"

# Получение SSL сертификата
certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive
