-- 협업 보드 Studio 플러그인
-- Studio에서 선택한 스크립트와 오브젝트를 협업 보드의 '받은 자료'로 보낸다.
--   스크립트(Script, LocalScript, ModuleScript) → 코드 그대로
--   그 밖의 오브젝트(Part, Model, Folder ...)  → 주요 속성 + 안에 든 스크립트들
-- 같은 경로를 다시 보내면 보드에서 R1, R2 ... 로 쌓인다.

local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")
local CollectionService = game:GetService("CollectionService")

local DEFAULT_SERVER = "http://localhost:8000"
local MAX_SCRIPTS_PER_OBJECT = 50

-- ---------- 값 → 글자 ----------
local function round(n: number): string
	return tostring(math.round(n * 1000) / 1000)
end

local function valueToText(v: any): any
	local t = typeof(v)
	if t == "Vector3" then
		return round(v.X) .. ", " .. round(v.Y) .. ", " .. round(v.Z)
	elseif t == "Vector2" then
		return round(v.X) .. ", " .. round(v.Y)
	elseif t == "Color3" then
		return math.round(v.R * 255) .. ", " .. math.round(v.G * 255) .. ", " .. math.round(v.B * 255)
	elseif t == "CFrame" then
		local rx, ry, rz = v:ToOrientation()
		return "위치 " .. valueToText(v.Position) .. " / 회전 "
			.. round(math.deg(rx)) .. ", " .. round(math.deg(ry)) .. ", " .. round(math.deg(rz))
	elseif t == "UDim2" then
		return string.format("{%s, %d}, {%s, %d}", round(v.X.Scale), v.X.Offset, round(v.Y.Scale), v.Y.Offset)
	elseif t == "EnumItem" then
		return v.Name
	elseif t == "Instance" then
		return v:GetFullName()
	elseif t == "boolean" or t == "number" or t == "string" then
		return v
	end
	return tostring(v)
end

-- 클래스마다 있는 속성이 달라서, 있으면 읽고 없으면 건너뛴다
local PROPERTY_NAMES = {
	"Position", "Size", "Orientation", "Anchored", "CanCollide", "Transparency", "Color", "Material", "Shape",
	"Value", "Text", "Enabled", "MaxHealth", "Health", "WalkSpeed", "JumpPower",
	"Image", "Texture", "SoundId", "Volume", "AnimationId", "MeshId", "TextureID",
}

local function readProperties(obj: Instance): { [string]: any }
	local props: { [string]: any } = { ClassName = obj.ClassName }
	for _, name in PROPERTY_NAMES do
		local ok, value = pcall(function()
			return (obj :: any)[name]
		end)
		if ok and value ~= nil then
			props[name] = valueToText(value)
		end
	end
	if obj:IsA("Model") then
		local ok, pivot = pcall(function()
			return obj:GetPivot()
		end)
		if ok then
			props.Pivot = valueToText(pivot)
		end
	end
	for key, value in obj:GetAttributes() do
		props["@" .. key] = valueToText(value) -- 속성(Attribute)은 @를 붙여 구분
	end
	local tags = CollectionService:GetTags(obj)
	if #tags > 0 then
		props.Tags = table.concat(tags, ", ")
	end
	local children = obj:GetChildren()
	if #children > 0 then
		local names = {}
		for i, child in children do
			if i > 20 then
				table.insert(names, "... 외 " .. (#children - 20) .. "개")
				break
			end
			table.insert(names, child.Name .. " (" .. child.ClassName .. ")")
		end
		props.Children = table.concat(names, ", ")
	end
	return props
end

-- ---------- 선택 → 보낼 목록 ----------
type Item = { title: string, kind: string, content: string, path: string, class_name: string }

local function scriptItem(s: LuaSourceContainer): Item
	return {
		title = s.Name,
		kind = "code",
		content = (s :: any).Source,
		path = s:GetFullName(), -- 예: ServerScriptService.BossAttack
		class_name = s.ClassName,
	}
end

local function collect(selection: { Instance }): { Item }
	local items: { Item } = {}
	local seen: { [Instance]: boolean } = {}
	local function add(obj: Instance, item: Item)
		if not seen[obj] then
			seen[obj] = true
			table.insert(items, item)
		end
	end
	for _, obj in selection do
		if obj:IsA("LuaSourceContainer") then
			add(obj, scriptItem(obj))
		else
			add(obj, {
				title = obj.Name,
				kind = "object",
				content = HttpService:JSONEncode(readProperties(obj)),
				path = obj:GetFullName(),
				class_name = obj.ClassName,
			})
			-- 폴더나 모델을 고르면 그 안의 스크립트도 같이 보낸다
			local count = 0
			for _, d in obj:GetDescendants() do
				if d:IsA("LuaSourceContainer") and count < MAX_SCRIPTS_PER_OBJECT then
					count += 1
					add(d, scriptItem(d))
				end
			end
		end
	end
	return items
end

-- ---------- 보내기 ----------
local function send(server: string, items: { Item }): (boolean, string)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = server .. "/studio/collect",
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = HttpService:JSONEncode({ items = items }),
		})
	end)
	if not ok then
		return false, "서버에 연결 못 했어요. 서버가 켜져 있는지 확인하세요. (" .. tostring(res) .. ")"
	end
	if not res.Success then
		return false, "서버 오류 " .. res.StatusCode .. ": " .. res.Body
	end
	local saved = HttpService:JSONDecode(res.Body)
	local names = {}
	for _, m in saved do
		table.insert(names, m.title .. " R" .. m.revision)
	end
	return true, #saved .. "개 보냄: " .. table.concat(names, ", ")
end

-- ---------- 화면 (툴바 + 작은 창) ----------
-- plugin 은 Studio가 플러그인으로 실행할 때만 있다 (테스트할 때는 없음)
if plugin then
	local toolbar = plugin:CreateToolbar("협업 보드")
	local sendButton = toolbar:CreateButton("보드로 보내기", "선택한 스크립트/오브젝트를 협업 보드로 보냅니다", "")
	local panelButton = toolbar:CreateButton("설정", "서버 주소와 마지막 결과를 봅니다", "")

	local widget = plugin:CreateDockWidgetPluginGui(
		"CollabBoardPanel",
		DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, false, 320, 160, 260, 140)
	)
	widget.Title = "협업 보드"

	local frame = Instance.new("Frame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = Color3.fromRGB(46, 46, 46)
	frame.Parent = widget
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 6)
	layout.Parent = frame
	local pad = Instance.new("UIPadding")
	pad.PaddingTop, pad.PaddingLeft, pad.PaddingRight = UDim.new(0, 8), UDim.new(0, 8), UDim.new(0, 8)
	pad.Parent = frame

	local function label(text: string, height: number): TextLabel
		local l = Instance.new("TextLabel")
		l.Size = UDim2.new(1, 0, 0, height)
		l.BackgroundTransparency = 1
		l.TextColor3 = Color3.fromRGB(230, 230, 230)
		l.TextXAlignment = Enum.TextXAlignment.Left
		l.TextYAlignment = Enum.TextYAlignment.Top
		l.TextWrapped = true
		l.Font = Enum.Font.Gotham
		l.TextSize = 13
		l.Text = text
		l.Parent = frame
		return l
	end

	label("서버 주소 (자료 서버, 보통 8000번)", 16)
	local serverBox = Instance.new("TextBox")
	serverBox.Size = UDim2.new(1, 0, 0, 26)
	serverBox.Text = plugin:GetSetting("server") or DEFAULT_SERVER
	serverBox.ClearTextOnFocus = false
	serverBox.TextSize = 13
	serverBox.Parent = frame
	serverBox.FocusLost:Connect(function()
		local url = serverBox.Text:gsub("/+$", "")
		serverBox.Text = url
		plugin:SetSetting("server", url)
	end)

	local sendInPanel = Instance.new("TextButton")
	sendInPanel.Size = UDim2.new(1, 0, 0, 28)
	sendInPanel.Text = "선택한 것 보드로 보내기"
	sendInPanel.TextSize = 14
	sendInPanel.Parent = frame

	local status = label("Explorer에서 스크립트나 오브젝트를 고르고 보내기를 누르세요.", 60)

	local function run()
		local items = collect(Selection:Get())
		if #items == 0 then
			status.Text = "고른 것이 없어요. Explorer에서 먼저 선택하세요."
			warn("[협업 보드] " .. status.Text)
			return
		end
		status.Text = #items .. "개 보내는 중..."
		local ok, message = send(serverBox.Text, items)
		status.Text = message
		if ok then
			print("[협업 보드] " .. message)
		else
			warn("[협업 보드] " .. message)
		end
	end

	sendButton.Click:Connect(run)
	sendInPanel.MouseButton1Click:Connect(run)
	panelButton.Click:Connect(function()
		widget.Enabled = not widget.Enabled
	end)
end
