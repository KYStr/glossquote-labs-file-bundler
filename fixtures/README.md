# Synthetic ZIP fixtures

These six small files contain generated memory bytes only. The empty-a archive contains an empty file named a; single-x contains a.txt with ASCII x; pair-180 contains a and b with byte values 1 and 2. The manifest records exact sizes and SHA-256.

Tests create their own in-memory inputs and temporary evidence directories; release builds need no private or external evidence files.
