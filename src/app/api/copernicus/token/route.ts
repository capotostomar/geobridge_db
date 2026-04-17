// Vercel: max execution time
export const maxDuration = 30

import { NextResponse } from "next/server";

// Cache in-memory del token (valido ~1h su Sentinel Hub).
// Su Vercel la cache vive per la durata della funzione "warm" —
// va bene per ridurre le richieste, ma non è garantita tra invocazioni cold.
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function GET() {
  // Restituisce il token cachato se ancora valido (con 90s di margine)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 90_000) {
    return NextResponse.json({ access_token: cachedToken.value });
  }

  const clientId = process.env.COPERNICUS_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET non configurate" },
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(
      "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        // next: { revalidate: 0 } — disabilita cache di Next fetch
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Impossibile raggiungere Copernicus identity server" },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Token fetch fallito", detail },
      { status: 502 }
    );
  }

  const data = await res.json();

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return NextResponse.json({ access_token: data.access_token });
}
