# IPASSCARE SMS Relay

The relay keeps the Bizgo API key and Supabase service-role key out of the browser.
It accepts authenticated requests from the IPASSCARE web app and sends SMS/LMS
through the Bizgo OMNI API from the Lightsail static IPv4 address.

## Runtime configuration

Copy `.env.example` to `/etc/ipasscare-sms-relay.env` on the server and replace
every placeholder. Never commit the real environment file.

The Node process binds to `127.0.0.1:3000` by default. Do not expose port 3000
in the Lightsail firewall. Publish only ports 80/443 through Nginx and HTTPS.

## Production network setup

1. Register the Lightsail static IPv4 `43.202.8.154` in the Bizgo ACL.
2. Point a DNS A record such as `sms-api.example.com` to that static IPv4.
3. Copy `nginx.conf.example`, replace its `server_name`, and enable it in Nginx.
4. Issue a TLS certificate with Certbot. The production web app must call HTTPS;
   an HTTPS page cannot call a plain HTTP relay.
5. Set the web hosting environment variable to
   `VITE_SMS_RELAY_URL=https://sms-api.example.com` and rebuild the web app.

## Endpoints

- `GET /health`
- `POST /v1/messages/send` (Supabase access token required)

## Supported in the first release

- Immediate SMS (up to 90 bytes)
- Immediate LMS (up to 2,000 bytes)
- Up to 200 recipients per request

Scheduled delivery and image MMS require separate worker/image-upload support.
