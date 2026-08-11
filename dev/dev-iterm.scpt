-- Development environment setup for iTerm2
-- Usage: osascript dev-iterm.scpt /path/to/project

on run argv
    set projectRoot to item 1 of argv

    tell application "iTerm"
        -- Create a new window
        set newWindow to (create window with default profile)

        tell current session of newWindow
            -- Set the working directory and run docker-compose (top left)
            write text "cd " & quoted form of projectRoot
            write text "docker-compose up postgres redis"

            -- Split vertically (right side) for frontend
            set frontendPane to (split vertically with default profile)
            tell frontendPane
                write text "cd " & quoted form of (projectRoot & "/frontend")
                write text "pnpm run dev"
            end tell
        end tell

        -- Split docker-compose pane horizontally for yjs-server (bottom left)
        tell current session of newWindow
            set yjsServerPane to (split horizontally with default profile)
            tell yjsServerPane
                write text "cd " & quoted form of (projectRoot & "/yjs-server")
                write text "pnpm run dev"
            end tell
        end tell

        -- Split frontend pane horizontally for backend (bottom right)
        tell frontendPane
            set backendPane to (split horizontally with default profile)
            tell backendPane
                write text "cd " & quoted form of (projectRoot & "/backend")
                write text "pnpm run dev"
            end tell
        end tell

        -- Split yjs-server pane vertically for admin dev server
        tell yjsServerPane
            set adminPane to (split vertically with default profile)
            tell adminPane
                write text "cd " & quoted form of (projectRoot & "/admin")
                write text "pnpm run dev"
            end tell
        end tell

    end tell
end run
