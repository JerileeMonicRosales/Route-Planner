"""weather.py - current weather at points along a route (Open-Meteo, no API key)."""
import requests

URL = "https://api.open-meteo.com/v1/forecast"


class WeatherError(Exception):
    pass


def describe(code):
    """WMO weather code -> (label, icon kind used by the frontend)."""
    if code == 0:
        return "Clear sky", "sun"
    if code in (1, 2):
        return "Partly cloudy", "cloud"
    if code == 3:
        return "Overcast", "cloud"
    if code in (45, 48):
        return "Fog", "fog"
    if 51 <= code <= 67 or 80 <= code <= 82:
        return "Rain", "rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "Snow", "snow"
    if code >= 95:
        return "Thunderstorm", "storm"
    return "Cloudy", "cloud"


def along_route(points):
    """points = [{"lat","lng"}, ...] (max 10). One request covers all of them."""
    params = {
        "latitude": ",".join(str(p["lat"]) for p in points),
        "longitude": ",".join(str(p["lng"]) for p in points),
        "current": "temperature_2m,weather_code,wind_speed_10m,precipitation",
        "timezone": "auto",
    }
    try:
        r = requests.get(URL, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError) as e:
        raise WeatherError(f"Weather service unavailable: {e}")
    data = data if isinstance(data, list) else [data]   # 1 point -> dict, many -> list
    out = []
    for p, d in zip(points, data):
        c = d.get("current") or {}
        label, kind = describe(c.get("weather_code", 3))
        out.append({"lat": p["lat"], "lng": p["lng"], "label": label, "kind": kind,
                    "temp_c": c.get("temperature_2m"), "wind_kmh": c.get("wind_speed_10m"),
                    "rain_mm": c.get("precipitation")})
    return out