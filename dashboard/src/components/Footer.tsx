export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-12">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-600">
          <div>
            <p>
              Weather MCP Analytics - Privacy-first usage statistics
            </p>
            <p className="text-xs mt-1">
              No PII collected • All data anonymous • Open source
            </p>
          </div>

          <div className="flex gap-6">
            <a
              href="https://github.com/weather-mcp/mcp-server"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://weather-mcp.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              Weather MCP
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
