#!/usr/bin/env python3
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_BASE = 'https://api.steampowered.com'
STORE_BASE = 'https://store.steampowered.com'
USER_AGENT = 'SteamCalendarCompanion/1.0'

def parse_eresult(headers):
    value = headers.get('X-Eresult') or headers.get('x-eresult')
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

def is_private(status, eresult):
    return status in (401, 402, 403) or eresult in (9, 13, 15)

def fetch_json(method, steamid):
    query = urllib.parse.urlencode({'steamid': str(steamid)})
    url = API_BASE + '/IWishlistService/' + method + '/v1?' + query
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            eresult = parse_eresult(response.headers)
            data = json.loads(response.read().decode('utf-8'))
            return {'status': response.status, 'eresult': eresult, 'private': is_private(response.status, eresult), 'data': data}
    except urllib.error.HTTPError as error:
        try:
            data = json.loads(error.read().decode('utf-8'))
        except Exception:
            data = None
        eresult = parse_eresult(error.headers)
        return {'status': error.code, 'eresult': eresult, 'private': is_private(error.code, eresult), 'data': data}

def parse_count(data):
    response = data.get('response') if isinstance(data, dict) else None
    if isinstance(response, dict):
        return response.get('count')
    return None

def parse_items(data):
    response = data.get('response') if isinstance(data, dict) else None
    if not isinstance(response, dict):
        return []
    items = response.get('items')
    if not isinstance(items, list):
        return []
    out = []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get('appid'), int):
            out.append({'appid': item['appid'], 'priority': item.get('priority'), 'date_added': item.get('date_added')})
    return out

def get_app_details(appid):
    params = {'appids': str(appid), 'filters': 'basic,release_date', 'l': 'en'}
    for extra in ({}, {'cc': 'us'}):
        query = urllib.parse.urlencode({**params, **extra})
        request = urllib.request.Request(STORE_BASE + '/api/appdetails?' + query, headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode('utf-8'))
                entry = data.get(str(appid), {})
                if entry.get('success'):
                    return entry.get('data', {})
        except Exception:
            pass
    return None

def fetch_wishlist(steamid, with_details=False, max_details=250, delay=0.2):
    count = fetch_json('GetWishlistItemCount', steamid)
    listing = fetch_json('GetWishlist', steamid)
    private = count['private'] or listing['private']
    items = parse_items(listing['data'])
    total = parse_count(count['data'])
    out = {'steamid': str(steamid), 'private': private, 'totalKnown': total, 'items': items, 'warnings': []}
    if out['totalKnown'] is None:
        out['totalKnown'] = len(items)
    if private:
        out['warnings'].append('profile appears private or API access was rejected')
    if with_details:
        for index, item in enumerate(items[:max_details]):
            if index:
                time.sleep(delay)
            details = get_app_details(item['appid'])
            if not details:
                out['warnings'].append('appdetails failed for appid ' + str(item['appid']))
                continue
            item['name'] = details.get('name')
            item['coverImage'] = details.get('header_image')
            item['releaseDateText'] = details.get('release_date', {}).get('date')
            item['releaseDateUnix'] = details.get('release_date', {}).get('unix')
    return out

def main(argv):
    if len(argv) < 2:
        print('usage: python scripts/public_wishlist_api.py <steamid> [--details]', file=sys.stderr)
        return 2
    result = fetch_wishlist(int(argv[1]), '--details' in argv[2:])
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
