from thefuzz import fuzz

pairs = [
    ('Altar of Burnt Offering', 'Burnt Offering'),
    ('Coliseum', 'Coliseum Lion'),
    ('Canaan', 'Capturing Canaan'),
    ('Nineveh', 'The King of Nineveh'),
    ('Egypt', 'Out of Egypt'),
    ('Nicodemus, the seeker', 'Nicodemus the Seeker'),
    ('The Worm', 'Worm')
]

for a, b in pairs:
    print(f'"{a}" vs "{b}":')
    print(f'  token_set_ratio:  {fuzz.token_set_ratio(a, b)}')
    print(f'  token_sort_ratio: {fuzz.token_sort_ratio(a, b)}')
    print(f'  ratio:            {fuzz.ratio(a, b)}')
