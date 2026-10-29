# The web server for the ILIAS end-to-end job (M2-21, standards.md T-5): Apache with PHP 8.4, which
# ILIAS 11 supports, and the PHP extensions ILIAS's installation guide asks for. ILIAS publishes no
# container image of its own, so this builds one from PHP's official image, pinned by digest; the
# ILIAS release itself is unpacked into a volume by compose.yaml. Bump the digest only to one
# published at least two weeks earlier.
FROM php:8.4.25-apache-bookworm@sha256:0629e7852d88a0939841973910d94157de7cd68e48acefac44546f8534b45d31

# Required by ILIAS: gd, dom, xsl, pdo_mysql, curl, json, simplexml, libxml, xml, zip, mbstring.
# The image already has dom, curl, json, simplexml, libxml, xml and mbstring. Not installed: imagick
# (previews and image conversion; nothing the SCORM player uses) and the optional soap and ldap.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libfreetype6-dev libjpeg62-turbo-dev libpng-dev libxslt1-dev libzip-dev libicu-dev \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j"$(nproc)" gd xsl zip pdo_mysql mysqli intl opcache \
 && rm -rf /var/lib/apt/lists/*

# ILIAS's web root is the release's public/ folder, with its .htaccess rules (mod_rewrite).
RUN a2enmod rewrite headers \
 && sed -ri 's!/var/www/html!/var/www/ilias/public!g' /etc/apache2/sites-available/*.conf \
 && printf '<Directory /var/www/ilias/>\n  Options +FollowSymLinks -Indexes\n  AllowOverride All\n  Require all granted\n</Directory>\n' \
      > /etc/apache2/conf-enabled/ilias.conf

# The php.ini settings ILIAS's installation guide recommends.
RUN printf '%s\n' \
      'memory_limit = 512M' \
      'max_execution_time = 600' \
      'post_max_size = 256M' \
      'upload_max_filesize = 256M' \
      'max_input_vars = 10000' \
      'error_reporting = E_ALL & ~E_NOTICE & ~E_DEPRECATED' \
      'display_errors = Off' \
      'log_errors = On' \
      'session.gc_probability = 1' \
      'session.gc_divisor = 100' \
      'session.gc_maxlifetime = 14400' \
      'session.cookie_httponly = On' \
      'allow_url_fopen = 1' \
      > /usr/local/etc/php/conf.d/ilias.ini
