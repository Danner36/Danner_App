"""Import-time stand-in for the compiled `lzfse` extension (see lzss.py for why)."""


def decompress(data):
    raise NotImplementedError("lzfse shim: lzfse is not installed on this PC")


def compress(data):
    raise NotImplementedError("lzfse shim: lzfse is not installed on this PC")
