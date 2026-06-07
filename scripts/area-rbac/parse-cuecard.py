#!/usr/bin/env python3
"""Parse the 'CUE CARDS as of 5.5.26.xlsx' Team Summary sheet into a JSON manifest
of (group_name, person_name, role_tag) tuples. Output: stdout JSON.

Role tags from cue card:
    AH       Area Head
    AAH      Assistant Area Head
    TL       Team Leader
    CARAVAN  default (no parenthesized tag)

Used by Stage 2 of the area-RBAC rollout (spec 2026-06-07) to seed
group_role_members with the real-world assignments. The users.role column
in prod is 'caravan' for everyone because the demo required caravan-level
permissions; the cue card is the source of truth for who is actually
an AH / AAH / TL.
"""
import openpyxl
import re
import json
import sys

DEFAULT_PATH = '/home/claude-team/loi/IMU Migration/CUE CARDS as of 5.5.26.xlsx'
GROUP_NAMES = [
    'NORTH AGUILA', 'UNSTOPPABLE', 'GENERALS',
    'EXPLORER REBORN', 'EXPLORER-REBORN', 'WARRIORS', 'SULTANS',
]


def normalize(s):
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s)).strip().upper()


def find_group_headers(rows):
    positions = []
    for ri, row in enumerate(rows):
        for ci, cell in enumerate(row):
            n = normalize(cell)
            for g in GROUP_NAMES:
                if n == g or n.strip() == g.strip():
                    canonical = g.replace('EXPLORER-REBORN', 'EXPLORER REBORN')
                    positions.append((canonical, ri, ci))
    return positions


def extract_members(rows, header_row, group_col):
    name_col = group_col + 2
    members = []
    for r in range(header_row + 2, min(header_row + 15, len(rows))):
        if group_col >= len(rows[r]):
            break
        no_cell = rows[r][group_col]
        name_cell = rows[r][name_col] if name_col < len(rows[r]) else None
        if (no_cell is None or not str(no_cell).strip()) and \
           (name_cell is None or not str(name_cell).strip()):
            break
        if name_cell is None or not str(name_cell).strip():
            continue
        name_str = str(name_cell).strip()
        role_match = re.search(r'\(([A-Z]+)\)\s*$', name_str)
        role = role_match.group(1) if role_match else 'CARAVAN'
        clean = re.sub(r'\s*\([A-Z]+\)\s*$', '', name_str).strip()
        members.append({'name': clean, 'role_tag': role})
    return members


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb['Team Summary']
    rows = list(ws.iter_rows(values_only=True))

    assignments = {}
    for g, hr, gc in find_group_headers(rows):
        members = extract_members(rows, hr, gc)
        if not members:
            continue
        if g in assignments:
            existing = {m['name'] for m in assignments[g]}
            for m in members:
                if m['name'] not in existing:
                    assignments[g].append(m)
        else:
            assignments[g] = members

    print(json.dumps(assignments, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
