"""Import-time stand-in for the compiled `pylzss` extension.

pyimg4 imports `lzss` at module load. Building pylzss needs a C compiler, which this
Windows PC does not have. pymobiledevice3 only needs pyimg4 for personalized developer
image handling, which never touches LZSS-compressed payloads on this device, so a stub
that raises on use is enough to let the `developer` and `mounter` command groups import.
"""


def decompress(data):
    raise NotImplementedError("lzss shim: pylzss is not installed on this PC")


def compress(data):
    raise NotImplementedError("lzss shim: pylzss is not installed on this PC")
