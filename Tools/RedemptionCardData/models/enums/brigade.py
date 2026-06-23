from enum import Enum

class GoodBrigade(str, Enum):
    White = "White"
    Gold = "Gold"
    Red = "Red"
    Blue = "Blue"
    Green = "Green"
    Teal = "Teal"
    Silver = "Silver"
    Purple = "Purple"
    Clay = "Clay"
    Multi = "Multi"

class EvilBrigade(str, Enum):
    Brown = "Brown"
    Gray = "Gray"
    Orange = "Orange"
    Black = "Black"
    Crimson = "Crimson"
    Gold = "Gold"
    Pale_Green = "Pale Green"
    Multi = "Multi"

ALL_BRIGADES = {b.value for b in GoodBrigade} | {b.value for b in EvilBrigade}
