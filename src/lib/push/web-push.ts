import webpush from "web-push";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

export const pushConfigured = Boolean(publicKey && privateKey && subject);

if (pushConfigured) {
  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
}

export { webpush };
