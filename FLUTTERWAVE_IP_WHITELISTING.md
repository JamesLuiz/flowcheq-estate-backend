# Flutterwave IP Whitelisting Guide

## Problem

Flutterwave requires IP whitelisting for certain operations, especially **transfers/withdrawals**. This causes issues when:

1. **Local Development**: Your local IP changes or you're behind a dynamic IP
2. **Serverless Hosting (Vercel)**: Vercel uses dynamic IPs that change with each deployment/function invocation
3. **Multiple Environments**: Different IPs for dev, staging, and production

## Error Message

```
Please enable IP Whitelisting to access this service
```

## Solutions

### Solution 1: Disable IP Whitelisting (Recommended for Development)

**For Development/Testing:**
1. Log into your Flutterwave Dashboard
2. Go to **Settings** → **API Keys & Webhooks**
3. Find **IP Whitelisting** section
4. **Disable IP Whitelisting** (if available for your account type)

**Note:** Some account types may require IP whitelisting for security. If you can't disable it, use Solution 2 or 3.

### Solution 2: Use Webhooks (Recommended for Production)

Instead of making direct API calls that require IP whitelisting, use Flutterwave webhooks to handle transfer status updates.

**How it works:**
1. Initiate transfer (may fail due to IP whitelisting, but that's okay)
2. Mark withdrawal as "pending" in your database
3. Flutterwave processes the transfer
4. Flutterwave sends webhook to your server when transfer completes
5. Update withdrawal status based on webhook

**Setup:**

1. **Configure Webhook URL in Flutterwave Dashboard:**
   - Go to **Settings** → **Webhooks**
   - Add webhook URL: `https://your-domain.com/webhooks/flutterwave/transfer`
   - Select events: `transfer.completed`, `transfer.failed`

2. **Set Environment Variable:**
   ```env
   FLUTTERWAVE_WEBHOOK_URL=https://your-domain.com/webhooks/flutterwave/transfer
   FLUTTERWAVE_ENCRYPTION_KEY=your_encryption_key  # For webhook verification
   ```

3. **The webhook handler is already created** in `flutterwave-webhook.controller.ts`

**Current Implementation:**
- Your code already handles IP whitelisting failures gracefully
- Withdrawals are marked as "pending" when API call fails
- Webhook will update status to "successful" or "failed" when transfer completes

### Solution 3: Whitelist Vercel IPs (Not Recommended)

Vercel doesn't provide static IPs. You would need to:
- Use a service like **Upstash** or **Inngest** that provides static IPs
- Or use a proxy service with static IPs
- This is complex and not recommended

### Solution 4: Use a Background Job Service with Static IP

Use a service with static IPs for Flutterwave API calls:
- **Render** (provides static IPs for background workers)
- **Railway** (can provide static IPs)
- **AWS Lambda with VPC** (more complex)

## Recommended Approach for Vercel

**Use Solution 2 (Webhooks):**

1. **Keep current implementation** - it already handles IP whitelisting failures
2. **Set up webhook endpoint** - already created in `flutterwave-webhook.controller.ts`
3. **Configure webhook in Flutterwave dashboard**
4. **Test the flow:**
   - User requests withdrawal
   - API call may fail due to IP whitelisting (that's okay)
   - Withdrawal marked as "pending"
   - Flutterwave processes transfer
   - Webhook updates status to "successful" or "failed"

## Local Development

For local development, you have two options:

### Option A: Disable IP Whitelisting (Easiest)
- Disable IP whitelisting in Flutterwave dashboard for development

### Option B: Whitelist Your Local IP
1. Find your public IP: https://whatismyipaddress.com/
2. Go to Flutterwave Dashboard → Settings → IP Whitelisting
3. Add your IP address
4. **Note:** If your IP changes (e.g., restarting router), you'll need to update it

### Option C: Use ngrok for Webhooks (Testing)
1. Install ngrok: `npm install -g ngrok`
2. Start your server: `npm run start:dev`
3. Expose it: `ngrok http 3000`
4. Use ngrok URL for webhook testing: `https://your-ngrok-url.ngrok.io/webhooks/flutterwave/transfer`

## Testing Webhooks Locally

1. Use **ngrok** or **localtunnel** to expose your local server
2. Set webhook URL in Flutterwave dashboard to your ngrok URL
3. Test withdrawal flow
4. Check webhook logs in your terminal

## Production Checklist

- [ ] Webhook endpoint is accessible: `https://your-domain.com/webhooks/flutterwave/transfer`
- [ ] Webhook URL configured in Flutterwave dashboard
- [ ] `FLUTTERWAVE_ENCRYPTION_KEY` is set for webhook verification
- [ ] Test withdrawal flow end-to-end
- [ ] Monitor webhook logs for errors
- [ ] Set up alerts for failed webhooks

## Current Code Behavior

Your current implementation already handles this gracefully:

```typescript
// In users.controller.ts - withdrawFunds method
try {
  transferResult = await this.flutterwaveService.withdrawFundsFromVirtualAccount({...});
  // Success - update status to 'processing'
} catch (flutterwaveError: any) {
  // IP whitelisting error - mark as 'pending'
  status = 'pending';
  // Deduct locally since balance was verified
  await this.usersService.deductFromWalletBalance(user.sub, body.amount);
}
```

The withdrawal is marked as "pending" and will be updated via webhook when Flutterwave processes it.

## Webhook Endpoint

**URL:** `POST /webhooks/flutterwave/transfer`

**Events Handled:**
- `transfer.completed` - Updates withdrawal status to "successful"
- `transfer.failed` - Updates withdrawal status to "failed"

**Security:**
- Webhook signature verification using `FLUTTERWAVE_ENCRYPTION_KEY`
- Returns error if signature is invalid

## Additional Resources

- [Flutterwave Webhooks Documentation](https://developer.flutterwave.com/docs/events)
- [Flutterwave IP Whitelisting](https://developer.flutterwave.com/docs/security)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)

