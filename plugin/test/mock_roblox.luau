-- Roblox Studio 없이 플러그인 코드를 돌려보기 위한 가짜 game, Instance, HttpService
-- (run.sh 가 이 파일 + SendToBoard.lua + collect_test.luau 를 이어붙여 luau 로 실행한다)

local function vec3(x, y, z) return { __type = "Vector3", X = x, Y = y, Z = z } end
local function color3(r, g, b) return { __type = "Color3", R = r, G = g, B = b } end
local function enumItem(name) return { __type = "EnumItem", Name = name } end

local typeof = function(v)
	if type(v) == "table" then
		if v.__type then return v.__type end
		if v.__instance then return "Instance" end
	end
	return type(v)
end

local function encode(v)
	local t = type(v)
	if t == "string" then
		return '"' .. v:gsub('[%c"\\]', function(c)
			local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\t"] = "\\t", ["\r"] = "\\r" }
			return map[c] or string.format("\\u%04x", string.byte(c))
		end) .. '"'
	elseif t == "number" or t == "boolean" then
		return tostring(v)
	elseif t == "table" then
		if #v > 0 or next(v) == nil then
			local parts = {}
			for _, x in ipairs(v) do table.insert(parts, encode(x)) end
			return "[" .. table.concat(parts, ",") .. "]"
		end
		local parts = {}
		for k, x in pairs(v) do table.insert(parts, encode(tostring(k)) .. ":" .. encode(x)) end
		table.sort(parts)
		return "{" .. table.concat(parts, ",") .. "}"
	end
	return "null"
end

local sentBodies = {}
local HttpService = {
	JSONEncode = function(_, v) return encode(v) end,
	JSONDecode = function(_, _s) return { { title = "Mock", revision = 1 } } end,
	RequestAsync = function(_, req)
		table.insert(sentBodies, req)
		return { Success = true, StatusCode = 200, Body = "" }
	end,
}

local selected = {}
local tagsOf = {}
local services = {
	HttpService = HttpService,
	Selection = { Get = function() return selected end },
	CollectionService = { GetTags = function(_, obj) return tagsOf[obj] or {} end },
}
local game = { GetService = function(_, name) return services[name] end }
local plugin = nil

local SCRIPT_CLASSES = { Script = true, LocalScript = true, ModuleScript = true }
local function newInstance(className, name, props, parent)
	local obj = props or {}
	obj.__instance = true
	obj.ClassName, obj.Name, obj.Parent = className, name, parent
	obj.__children = {}
	obj.__attributes = obj.__attributes or {}
	if parent then table.insert(parent.__children, obj) end
	function obj:IsA(c)
		if c == "LuaSourceContainer" then return SCRIPT_CLASSES[self.ClassName] == true end
		if c == "BasePart" then return self.ClassName == "Part" end
		return self.ClassName == c
	end
	function obj:GetFullName()
		local names, o = {}, self
		while o do table.insert(names, 1, o.Name); o = rawget(o, "Parent") end
		return table.concat(names, ".")
	end
	function obj:GetChildren() return self.__children end
	function obj:GetDescendants()
		local out = {}
		local function walk(o) for _, c in o.__children do table.insert(out, c); walk(c) end end
		walk(self)
		return out
	end
	function obj:GetAttributes() return self.__attributes end
	function obj:GetPivot() return { __type = "CFrame" } end
	-- 없는 속성을 읽으면 Roblox처럼 에러
	return setmetatable(obj, { __index = function(_, k) error(k .. " is not a valid member") end })
end
