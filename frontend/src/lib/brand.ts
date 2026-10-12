// Single source of truth for the app name: messages/brand.json (also read by the backend).
import brand from "../../messages/brand.json";

export const BRAND = brand as { name: string; slug: string; wordmark: [string, string] };
