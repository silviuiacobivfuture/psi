#!/bin/sh
# Roundcube image post-setup task: the estate's theme plugin joins the copied docroot. It is
# mounted beside it (/var/roundcube/estate_theme), never inside: a mount inside the docroot makes
# the kubelet create plugins/ as root, and the image (running as www-data) then cannot copy itself.
set -e
ln -sfn /var/roundcube/estate_theme /var/www/html/plugins/estate_theme
