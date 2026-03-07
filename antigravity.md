API Documentation
Access Minecraft server jar metadata, download URLs, and version information programmatically.

Base URL:
https://mcserverjars.com/api
All Server Types
Paper, Spigot, CraftBukkit, Vanilla, Purpur, and more

Direct Downloads
Get verified download URLs with SHA256 checksums

Version Metadata
Complete build history and version information

NMS Mappings
Minecraft to CraftBukkit revision mappings

Endpoints
GET
/v1/projects
List all available server software projects

Example
https://mcserverjars.com/api/v1/projects
Response
[
  {
    "id": "paper",
    "name": "Paper",
    "description": "High performance Spigot fork",
    "category": "servers"
  },
  ...
]
GET
/v1/projects/:slug
Get details for a specific project

Example
https://mcserverjars.com/api/v1/projects/paper
Response
{
  "id": "paper",
  "name": "Paper",
  "description": "High performance Spigot fork",
  "category": "servers",
  "website": "https://papermc.io"
}
GET
/v1/projects/:slug/versions
List all Minecraft versions available for a project

Example
https://mcserverjars.com/api/v1/projects/paper/versions
Response
[
  "1.21.4",
  "1.21.3",
  "1.21.1",
  ...
]
GET
/v1/projects/:slug/versions/:version
List all builds for a specific version

Example
https://mcserverjars.com/api/v1/projects/paper/versions/1.21.4
Response
[
  {
    "build": 123,
    "download_url": "https://...",
    "sha256": "abc123...",
    "created_at": "2024-01-15T12:00:00Z"
  },
  ...
]
GET
/v1/projects/:slug/versions/:version/latest
Get the latest build for a specific version

Example
https://mcserverjars.com/api/v1/projects/paper/versions/1.21.4/latest
Response
{
  "build": 123,
  "download_url": "https://...",
  "sha256": "abc123...",
  "created_at": "2024-01-15T12:00:00Z"
}
GET
/v1/nms-mappings
Get all Minecraft to NMS revision mappings

Example
https://mcserverjars.com/api/v1/nms-mappings
Response
[
  {
    "minecraft_version": "1.21.4",
    "nms_revision": "v1_21_R3",
    "craftbukkit_package": "org.bukkit.craftbukkit.v1_21_R3"
  },
  ...
]
GET
/v1/nms-mappings/:version
Get NMS revision for a specific Minecraft version

Example
https://mcserverjars.com/api/v1/nms-mappings/1.21.4
Response
{
  "minecraft_version": "1.21.4",
  "nms_revision": "v1_21_R3",
  "craftbukkit_package": "org.bukkit.craftbukkit.v1_21_R3"
}
GET
/v1/changelogs
List all developer-focused changelogs

Example
https://mcserverjars.com/api/v1/changelogs?project=paper
Response
{
  "changelogs": [
    {
      "version": "1.21.11",
      "project": "paper",
      "summary": "...",
      "breaking_changes": [...],
      "api_changes": [...]
    }
  ]
}
GET
/v1/changelogs/:version
Get changelogs for a specific version

Example
https://mcserverjars.com/api/v1/changelogs/1.21.11
Response
{
  "version": "1.21.11",
  "changelogs": [
    { "project": "vanilla", ... },
    { "project": "paper", ... },
    { "project": "spigot", ... }
  ]
}
GET
/v1/changelogs/range
Get aggregated changelogs between versions (for LLMs)

Example
https://mcserverjars.com/api/v1/changelogs/range?from=1.21.9&to=1.21.11&project=paper
Response
{
  "from_version": "1.21.9",
  "to_version": "1.21.11",
  "by_project": {
    "paper": {
      "breaking_changes": ["[1.21.10] ...", "[1.21.11] ..."],
      "api_changes": [...]
    }
  }
}