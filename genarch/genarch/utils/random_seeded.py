"""
Seeded random number generator for deterministic generation.

Wraps Python's random module with seed control for reproducibility.
Same seed always produces the same sequence of random numbers.
"""

import random
from typing import List, TypeVar, Sequence

T = TypeVar("T")


class SeededRandom:
    """
    Seeded random number generator.

    Provides deterministic random number generation for reproducible
    floor plan generation. Same seed always produces the same results.

    Usage:
        rng = SeededRandom(seed=42)
        value = rng.random()  # Always same value for seed 42
        choice = rng.choice(["a", "b", "c"])
    """

    def __init__(self, seed: int):
        """
        Initialize with seed.

        Args:
            seed: Integer seed for random number generator
        """
        self.seed = seed
        self._rng = random.Random(seed)

    def reset(self) -> None:
        """Reset the generator to initial seed state."""
        self._rng = random.Random(self.seed)

    def random(self) -> float:
        """
        Get random float in range [0.0, 1.0).

        Returns:
            Random float
        """
        return self._rng.random()

    def uniform(self, a: float, b: float) -> float:
        """
        Get random float in range [a, b].

        Args:
            a: Lower bound
            b: Upper bound

        Returns:
            Random float between a and b
        """
        return self._rng.uniform(a, b)

    def randint(self, a: int, b: int) -> int:
        """
        Get random integer in range [a, b] inclusive.

        Args:
            a: Lower bound (inclusive)
            b: Upper bound (inclusive)

        Returns:
            Random integer
        """
        return self._rng.randint(a, b)

    def choice(self, seq: Sequence[T]) -> T:
        """
        Choose random element from sequence.

        Args:
            seq: Sequence to choose from

        Returns:
            Random element from sequence

        Raises:
            IndexError: If sequence is empty
        """
        return self._rng.choice(seq)

    def choices(self, seq: Sequence[T], k: int = 1) -> List[T]:
        """
        Choose k random elements from sequence with replacement.

        Args:
            seq: Sequence to choose from
            k: Number of elements to choose

        Returns:
            List of k random elements
        """
        return self._rng.choices(seq, k=k)

    def shuffle(self, seq: List[T]) -> None:
        """
        Shuffle sequence in-place.

        Args:
            seq: List to shuffle (modified in-place)
        """
        self._rng.shuffle(seq)

    def shuffled(self, seq: Sequence[T]) -> List[T]:
        """
        Return shuffled copy of sequence.

        Args:
            seq: Sequence to shuffle

        Returns:
            New shuffled list
        """
        result = list(seq)
        self._rng.shuffle(result)
        return result

    def sample(self, seq: Sequence[T], k: int) -> List[T]:
        """
        Choose k unique random elements from sequence.

        Args:
            seq: Sequence to sample from
            k: Number of unique elements to choose

        Returns:
            List of k unique random elements

        Raises:
            ValueError: If k > len(seq)
        """
        return self._rng.sample(list(seq), k)

    def gauss(self, mu: float = 0.0, sigma: float = 1.0) -> float:
        """
        Get random value from Gaussian distribution.

        Args:
            mu: Mean
            sigma: Standard deviation

        Returns:
            Random float from normal distribution
        """
        return self._rng.gauss(mu, sigma)

    def weighted_choice(self, options: List[T], weights: List[float]) -> T:
        """
        Choose random element with weights.

        Args:
            options: List of options
            weights: List of weights (same length as options)

        Returns:
            Weighted random choice

        Raises:
            ValueError: If options and weights have different lengths
        """
        if len(options) != len(weights):
            raise ValueError("options and weights must have same length")
        return self._rng.choices(options, weights=weights, k=1)[0]
