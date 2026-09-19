/*
 * Supabase Edge Function: send-web-push
 *
 * Receives a Supabase Database Webhook payload for an INSERT on
 * public.notifications, then sends encrypted Web Push messages to every
 * registered browser device for that notification recipient.
 *
 * Required Supabase Edge Function secrets:
 *   VAPID_PUBLIC_KEY  - matches the VITE_WEB_PUSH_PUBLIC_KEY frontend value
 *   VAPID_PRIVATE_KEY - keep server-side only; never expose to Vite
 *   VAPID_SUBJECT     - mailto: or https: contact URL
 *   WEBHOOK_SECRET    - random secret configured as the webhook header
 *
 * Deploy:
 *   supabase functions deploy send-web-push --project-ref fcjgbbmfqdkucfpqjxae
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@gagachat.app";
const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";

const admin = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : null;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function stringValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isPushSubscription(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.endpoint === "string"
        && typeof record.keys === "object"
        && record.keys !== null;
}

function parseSubscription(value: unknown): Record<string, unknown> | null {
    if (isPushSubscription(value)) return value;
    if (typeof value !== "string") return null;
    try {
        const parsed: unknown = JSON.parse(value);
        return isPushSubscription(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function getNotificationRecord(body: Record<string, unknown>): Record<string, unknown> | null {
    const record = body.record;
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    return record as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    if (!webhookSecret || req.headers.get("x-webhook-secret") !== webhookSecret) {
        return json({ error: "Unauthorized" }, 401);
    }

    if (!admin || !vapidPublicKey || !vapidPrivateKey) {
        return json({ error: "Push backend is not configured" }, 503);
    }

    let body: Record<string, unknown>;
    try {
        const parsed: unknown = await req.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return json({ error: "JSON object body is required" }, 400);
        }
        body = parsed as Record<string, unknown>;
    } catch {
        return json({ error: "Invalid JSON" }, 400);
    }

    if (body.type && body.type !== "INSERT") {
        return json({ sent: 0, skipped: true });
    }

    const record = getNotificationRecord(body);
    const userId = stringValue(record?.user_id ?? record?.userId);
    if (!record || !userId) return json({ error: "Notification recipient is required" }, 400);

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const { data: devices, error: deviceError } = await admin
        .from("user_devices")
        .select("id, push_subscription, platform")
        .eq("user_id", userId)
        .not("push_subscription", "is", null);

    if (deviceError) {
        console.error("[send-web-push] device lookup failed", deviceError.message);
        return json({ error: "Device lookup failed" }, 500);
    }

    const notification = {
        title: stringValue(record.title) || "GaGa Chat",
        body: stringValue(record.body) || "You have a new notification",
        tag: `notification_${stringValue(record.id) || userId}`,
        data: {
            type: stringValue(record.type) || "message",
            notificationId: stringValue(record.id),
            ...(record.data && typeof record.data === "object" ? record.data : {}),
        },
    };

    let sent = 0;
    let failed = 0;
    let removed = 0;

    for (const device of devices || []) {
        const subscription = parseSubscription(device.push_subscription);
        if (!subscription) {
            failed++;
            continue;
        }

        try {
            await webpush.sendNotification(subscription, JSON.stringify(notification), {
                TTL: 60,
                urgency: "high",
            });
            sent++;
        } catch (error) {
            failed++;
            const statusCode = (error as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                const { error: deleteError } = await admin.from("user_devices").delete().eq("id", device.id);
                if (!deleteError) removed++;
            } else {
                console.error("[send-web-push] delivery failed", error);
            }
        }
    }

    return json({ sent, failed, removed });
});
