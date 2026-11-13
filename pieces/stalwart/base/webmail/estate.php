<?php
// The estate's webmail (Roundcube), read by the image's entrypoint from /var/roundcube/config.
// Every value from the environment (stalwart-settings, webmail-app): no estate is named here.
//
// SIGN-IN: only through the estate's Authentik. oauth_login_redirect sends the browser straight
// to it, so Roundcube's own form never shows and nobody types a password here. The access token
// Authentik returns is presented to the mail server over IMAP and SMTP (OAUTHBEARER), where
// Stalwart's OIDC directory validates it and maps the person to their mailbox by the
// `mail_address` claim, the same claim this page signs them in with.
$host = getenv('MAIL_HOST');
$issuer = 'https://' . getenv('AUTHENTIK_HOST') . '/application/o/mail-oidc/';
$tls = ['ssl' => ['peer_name' => $host, 'verify_peer' => true, 'verify_peer_name' => true]];

// The mail server inside the cluster (stalwart-mail), checked against its public certificate.
$config['imap_host'] = 'ssl://stalwart-mail.stalwart.svc.cluster.local:993';
$config['imap_conn_options'] = $tls;
$config['smtp_host'] = 'tls://stalwart-mail.stalwart.svc.cluster.local:587';
$config['smtp_conn_options'] = $tls;
$config['username_domain'] = getenv('MAILBOX_DOMAIN');
$config['mail_domain'] = getenv('MAILBOX_DOMAIN');

$config['oauth_provider'] = 'generic';
$config['oauth_provider_name'] = getenv('BRAND_TITLE') ?: 'SSO';
// The PUBLIC client `mail-oidc` (PKCE), the one the mail server's directory trusts: Authentik
// gives each client its own issuer, and Stalwart's one directory accepts exactly one. Authentik
// checks no secret for a public client; Roundcube insists on sending one, so this is a label.
$config['oauth_client_id'] = 'mail-oidc';
$config['oauth_client_secret'] = 'public-client-pkce';
$config['oauth_config_uri'] = $issuer . '.well-known/openid-configuration';
$config['oauth_scope'] = 'openid email profile mail offline_access';
$config['oauth_identity_fields'] = ['mail_address'];
$config['oauth_auth_type'] = 'OAUTHBEARER';
$config['oauth_login_redirect'] = true;
$config['oauth_pkce'] = 'S256';
$config['oauth_cache'] = 'db';

$config['des_key'] = getenv('DES_KEY');
$config['product_name'] = getenv('BRAND_TITLE') ?: 'Webmail';
$config['support_url'] = '';
// The browser's language unless the estate names one.
if (getenv('WEBMAIL_LANGUAGE')) {
    $config['language'] = getenv('WEBMAIL_LANGUAGE');
}
$config['use_https'] = true;
$config['proxy_whitelist'] = ['10.0.0.0/8'];
$config['session_lifetime'] = 60;
// Mail only: no contacts or calendar here (they live in the estate's files-and-calendar app).
$config['address_book_type'] = '';
$config['plugins'] = array_values(array_unique(array_merge($config['plugins'] ?? [], ['estate_theme'])));
// The estate's mark, when its layer supplies one (components/estate/stalwart): logo.svg, and
// logo-dark.svg for the skin's dark mode.
$theme = '/var/roundcube/estate_theme/';
if (is_file($theme . 'logo.svg')) {
    $config['skin_logo'] = ['elastic:*' => 'plugins/estate_theme/logo.svg'];
    if (is_file($theme . 'logo-dark.svg')) {
        $config['skin_logo']['elastic:*[dark]'] = 'plugins/estate_theme/logo-dark.svg';
    }
}
