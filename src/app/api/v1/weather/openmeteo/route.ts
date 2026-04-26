// src/app/api/v1/weather/openmeteo/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const days = searchParams.get('days') || '7';

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Latitude and longitude required' }, { status: 400 });
  }

  // Parametri ottimizzati per risk analysis
  const hourlyParams = [
    'temperature_2m',
    'relative_humidity_2m', 
    'precipitation',
    'wind_speed_10m',
    'soil_moisture_0_to_1cm',
    'soil_moisture_9_to_27cm',
    'vapour_pressure_deficit',
    'et0_fao_evapotranspiration'
  ].join(',');

  const dailyParams = [
    'precipitation_sum',
    'temperature_2m_max',
    'et0_fao_evapotranspiration'
  ].join(',');

  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lon}&` +
    `hourly=${hourlyParams}&daily=${dailyParams}&` +
    `forecast_days=${days}&timezone=auto`;

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } }); // Cache 1h
    const data = await response.json();
    
    return NextResponse.json({
      location: { lat: parseFloat(lat), lon: parseFloat(lon) },
      generated: new Date().toISOString(),
      openmeteo: data
    });
  } catch (error) {
    console.error('Open-Meteo fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 502 });
  }
}
