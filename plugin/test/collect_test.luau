-- 가짜 Explorer: Workspace.BossArena(파트, 안에 스크립트 하나) + ServerScriptService.BossAttack
local workspaceRoot = newInstance("Workspace", "Workspace")
local sss = newInstance("ServerScriptService", "ServerScriptService")
local arena = newInstance("Part", "BossArena", {
	Position = vec3(0, 5.12345, 0), Size = vec3(50, 1, 50), Anchored = true, Color = color3(1, 0.5, 0),
	Material = enumItem("Slate"), __attributes = { Difficulty = "hard", Phase = 2 },
}, workspaceRoot)
tagsOf[arena] = { "BossRoom" }
newInstance("Script", "ArenaTrap", { Source = 'print("trap")' }, arena)
local attack = newInstance("Script", "BossAttack", { Source = 'local dmg = 25\nprint("공격", dmg)' }, sss)

selected = { arena, attack }
local items = collect(Selection:Get())
assert(#items == 3, "파트 + 안의 스크립트 + 선택한 스크립트 = 3개여야 함, 실제: " .. #items)
assert(items[1].kind == "object" and items[1].path == "Workspace.BossArena")
assert(items[2].kind == "code" and items[2].path == "Workspace.BossArena.ArenaTrap")
assert(items[3].kind == "code" and items[3].content:find("공격"))
local props = items[1].content
assert(props:find('"Position":"0, 5.123, 0"'), props)
assert(props:find('"Color":"255, 128, 0"'), props)
assert(props:find('"Material":"Slate"'), props)
assert(props:find('"@Difficulty":"hard"'), props)
assert(props:find('"Tags":"BossRoom"'), props)

local ok, message = send("http://localhost:8000", items)
assert(ok, message)
assert(sentBodies[1].Url == "http://localhost:8000/studio/collect")
-- 실제 서버로 다시 보내 볼 수 있게 보낸 내용을 출력한다
print(sentBodies[1].Body)
