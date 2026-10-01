"""Builds the KLSSF game's maths question bank.

Run:  python build_bank.py
Writes questions.json, a copy of it in public/content/ for the game to load,
and questions.xlsx for review.

Scope agreed with Johan, 30 Sept 2026:
  - multiplication: friendly 2-digit x 2-digit pairs only
  - division: 2-digit / 2-digit, and 3-digit / 2-digit giving a 2-digit answer
  - whole-number answers only
  - tier 1-3 so a run can start easy and ramp up by wave
  - "pad" marks questions short enough to type (answer of 3 digits or fewer)
"""
import json
import random
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

HERE = Path(__file__).parent
SEED = 2026  # fixed so the bank is identical on every rebuild

TENS = range(20, 100, 10)  # 10 x anything is a giveaway, so it is left out
TEENS = range(12, 20)  # 11 is handled by the x11 family


def multiplication_facts():
    """Yields (a, b, family, tier) with a <= b, each unordered pair once."""
    seen = set()

    def add(a, b, family, tier):
        a, b = sorted((a, b))
        if (a, b) in seen:
            return None
        seen.add((a, b))
        return (a, b, family, tier)

    facts = []

    # Tier 1: tens x tens (20 x 30).
    for a in TENS:
        for b in TENS:
            if a <= b:
                facts.append(add(a, b, "tens x tens", 1))

    # x11: no carry (11 x 23) is tier 2, with a carry (11 x 78) is tier 3.
    for n in range(12, 100):
        if n % 10 == 0:
            continue
        carry = (n // 10 + n % 10) >= 10
        facts.append(add(11, n, "x11", 3 if carry else 2))

    # Tens x teens (30 x 14): tier 2.
    for a in TENS:
        for b in TEENS:
            facts.append(add(a, b, "tens x teens", 2))

    # Teens x teens: both 15 or under is tier 2, otherwise tier 3.
    for a in TEENS:
        for b in TEENS:
            if a <= b:
                facts.append(add(a, b, "teens x teens", 2 if b <= 15 else 3))

    # Squares 21-25 (11-19 sit in the families above, 20 in tens): tier 3.
    for n in range(21, 26):
        facts.append(add(n, n, "squares", 3))

    # x25 with an even partner: multiples of 4 or 10 are tier 2, the rest tier 3.
    for n in range(12, 41, 2):
        easy = n % 4 == 0 or n % 10 == 0
        facts.append(add(25, n, "x25", 2 if easy else 3))

    return [f for f in facts if f]


def division_facts(mult):
    """Yields (dividend, divisor, family, tier)."""
    facts = []

    # 2-digit / 2-digit with a whole answer of 2-9 (84 / 12 = 7).
    for divisor in range(10, 50):
        for q in range(2, 10):
            dividend = divisor * q
            if dividend > 99:
                break
            easy = divisor <= 12 or q <= 3
            facts.append((dividend, divisor, "2-digit / 2-digit", 1 if easy else 2))

    # 3-digit / 2-digit giving a 2-digit answer: the multiplication bank run
    # backwards, one tier harder. Tier-3 multiplication facts are not reversed.
    for a, b, family, tier in mult:
        product = a * b
        if tier > 2 or not 100 <= product <= 999:
            continue
        for divisor in {a, b}:
            facts.append((product, divisor, "3-digit / 2-digit", tier + 1))

    return facts


def wrong_answers(answer, near, rng):
    """Three wrong options for multiple choice.

    Mixes options that share the last digit (so checking the last digit alone
    does not give it away) with 'one factor out by one step' slips. Round
    hundreds (20 x 40) get a wrong-number-of-zeros option instead.
    """
    if answer < 20:
        # Always one option below the answer when there is room, so the
        # smallest choice is not a giveaway.
        below = [answer + d for d in (-1, -2, -3) if answer + d >= 1]
        above = [answer + d for d in (1, 2, 3)]
        rng.shuffle(below)
        rng.shuffle(above)
        picks = below[:1] + above[:1]
        rest = below[1:] + above[1:]
        rng.shuffle(rest)
        return sorted(picks + rest[:1])

    # Choose where the right answer sits among the four (lowest, second,
    # third, highest) at random, so position gives nothing away. Options
    # that share the last digit come first, so the last digit alone never
    # settles it; round hundreds get a wrong-number-of-zeros option instead.
    if answer % 100 == 0:
        first = [answer * 10, answer // 10]
        step = 100
    else:
        first = [answer - 10, answer + 10, answer - 20, answer + 20]
        step = 10
    candidates = []
    for value in first + list(near) + [answer + step * k for k in (-3, 3, -4, 4)]:
        if value > 0 and value != answer and value not in candidates:
            candidates.append(value)
    below = [v for v in candidates if v < answer]
    above = [v for v in candidates if v > answer]
    ranks = [r for r in range(4) if r <= len(below) and 3 - r <= len(above)]
    rank = ranks[int(rng.random() * len(ranks))]
    # Keep the candidates' order of preference within each side.
    return sorted(below[:rank] + above[: 3 - rank])


def build():
    rng = random.Random(SEED)
    mult = multiplication_facts()
    div = division_facts(mult)
    questions = []

    for a, b, family, tier in mult:
        left, right = (a, b) if rng.random() < 0.5 else (b, a)
        answer = a * b
        da, db = (10 if a % 10 == 0 else 1), (10 if b % 10 == 0 else 1)
        near = [a * (b + db), a * (b - db), (a + da) * b, (a - da) * b]
        questions.append({
            "op": "x", "family": family, "tier": tier,
            "text": f"{left} × {right}", "answer": answer,
            "wrong": wrong_answers(answer, near, rng),
        })

    for dividend, divisor, family, tier in div:
        answer = dividend // divisor
        near = [answer + 1, answer - 1, answer + 2, answer - 2]
        questions.append({
            "op": "/", "family": family, "tier": tier,
            "text": f"{dividend} ÷ {divisor}", "answer": answer,
            "wrong": wrong_answers(answer, near, rng),
        })

    questions.sort(key=lambda q: (q["tier"], q["op"], q["family"], q["answer"], q["text"]))
    for i, q in enumerate(questions, 1):
        q["id"] = f"Q{i:03d}"
        q["pad"] = q["answer"] <= 999
    return questions


def check(questions):
    """Fails loudly if anything in the bank is wrong."""
    texts = set()
    for q in questions:
        left, symbol, right = q["text"].split(" ")
        left, right = int(left), int(right)
        if symbol == "×":
            assert 10 <= left <= 99 and 10 <= right <= 99, q
            assert left * right == q["answer"], q
        else:
            assert 10 <= right <= 99 and 10 <= left <= 999, q
            assert left % right == 0 and left // right == q["answer"], q
        assert len(q["wrong"]) == 3 and len(set(q["wrong"])) == 3, q
        assert q["answer"] not in q["wrong"] and all(w > 0 for w in q["wrong"]), q
        assert q["text"] not in texts, q
        texts.add(q["text"])
        assert q["tier"] in (1, 2, 3), q


def write_json(questions):
    fields = ("id", "tier", "op", "family", "text", "answer", "wrong", "pad")
    rows = [{k: q[k] for k in fields} for q in questions]
    text = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    (HERE / "questions.json").write_text(text, encoding="utf-8")
    # The copy the game loads.
    (HERE.parent / "public" / "content" / "questions.json").write_text(text, encoding="utf-8")


def write_xlsx(questions):
    wb = Workbook()
    ws = wb.active
    ws.title = "Questions"
    header = ["ID", "Tier", "Type", "Family", "Question", "Answer",
              "Wrong 1", "Wrong 2", "Wrong 3", "Typed (number pad)"]
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for q in questions:
        ws.append([q["id"], q["tier"], "Multiply" if q["op"] == "x" else "Divide",
                   q["family"], q["text"], q["answer"], *q["wrong"],
                   "yes" if q["pad"] else "no"])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, width in enumerate([7, 6, 10, 20, 14, 9, 9, 9, 9, 18], 1):
        ws.column_dimensions[get_column_letter(i)].width = width

    summary = wb.create_sheet("Summary")
    summary.append(["Tier", "Type", "Family", "Questions", "Of which typed"])
    for cell in summary[1]:
        cell.font = Font(bold=True)
    for key, count, pad in summarise(questions):
        summary.append([*key, count, pad])
    for i, width in enumerate([6, 10, 20, 11, 15], 1):
        summary.column_dimensions[get_column_letter(i)].width = width
    wb.save(HERE / "questions.xlsx")


def summarise(questions):
    groups = {}
    for q in questions:
        key = (q["tier"], "Multiply" if q["op"] == "x" else "Divide", q["family"])
        count, pad = groups.get(key, (0, 0))
        groups[key] = (count + 1, pad + q["pad"])
    return [(key, *groups[key]) for key in sorted(groups)]


if __name__ == "__main__":
    bank = build()
    check(bank)
    write_json(bank)
    write_xlsx(bank)
    print(f"{len(bank)} questions, all checked")
    for (tier, kind, family), count, pad in summarise(bank):
        print(f"  tier {tier}  {kind:<8}  {family:<18}  {count:>3}  (typed: {pad})")
    for tier in (1, 2, 3):
        rows = [q for q in bank if q["tier"] == tier]
        print(f"tier {tier}: {len(rows)} total, {sum(q['pad'] for q in rows)} typed-eligible")
