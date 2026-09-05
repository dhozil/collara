# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import datetime
class DebugTS2(gl.Contract):
    @gl.public.view
    def get_all(self) -> str:
        out=[]
        for name in ["gl.block.timestamp", "gl.message.timestamp", "gl.message.datetime", "datetime.now"]:
            try:
                if name=="gl.block.timestamp":
                    out.append(f"{name}={int(str(gl.block.timestamp))}")
                elif name=="gl.message.timestamp":
                    out.append(f"{name}={int(str(gl.message.timestamp))}")
                elif name=="gl.message.datetime":
                    out.append(f"{name}={str(gl.message.datetime)}")
                elif name=="datetime.now":
                    out.append(f"{name}={int(datetime.datetime.now(datetime.timezone.utc).timestamp())}")
            except Exception as e:
                out.append(f"{name} err:{e}")
        try:
            out.append(f"hasattr gl.block={hasattr(gl,'block')}")
            out.append(f"dir gl={ [x for x in dir(gl) if not x.startswith('_')][:10]}")
            out.append(f"dir gl.message={ [x for x in dir(gl.message) if not x.startswith('_')]}")
        except Exception as e:
            out.append(f"dir err:{e}")
        return " | ".join(out)
