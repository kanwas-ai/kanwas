import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

type PromptProviderName = 'anthropic' | 'openai'

const fileName = fileURLToPath(import.meta.url)
const dirName = dirname(fileName)

/**
 * PromptManager handles loading markdown prompts from disk and variable substitution
 *
 * Prompts are stored as .md files in the prompts/ directory
 * Variable syntax: {{variable_name}}
 *
 * Example:
 *   Template: "Hello {{name}}, you have {{count}} messages"
 *   Variables: { name: "Alice", count: "5" }
 *   Result: "Hello Alice, you have 5 messages"
 */
export class PromptManager {
  private promptCache: Map<string, string> = new Map()
  private promptsDir: string

  constructor() {
    this.promptsDir = join(dirName, 'prompts')
  }

  /**
   * Load a prompt by name (without .md extension)
   * Prompts are cached after first load for performance
   *
   * @param name - Prompt name (e.g., 'system', 'tools/create_document')
   * @param provider - Optional provider name for provider-specific prompt resolution
   * @returns Raw prompt template string
   */
  private loadPrompt(name: string, provider?: PromptProviderName): string {
    const promptPath = this.resolvePromptPath(name, provider)

    if (this.promptCache.has(promptPath)) {
      return this.promptCache.get(promptPath)!
    }

    try {
      const content = readFileSync(promptPath, 'utf-8')
      this.promptCache.set(promptPath, content)
      return content
    } catch (error) {
      throw new Error(`Failed to load prompt: ${name} (${promptPath})`, { cause: error })
    }
  }

  private resolvePromptPath(name: string, provider?: PromptProviderName): string {
    const candidatePaths = provider
      ? [join(this.promptsDir, `${name}.${provider}.md`), join(this.promptsDir, `${name}.md`)]
      : [join(this.promptsDir, `${name}.md`)]

    const resolvedPath = candidatePaths.find((candidatePath) => existsSync(candidatePath))

    if (!resolvedPath) {
      throw new Error(`Failed to load prompt: ${name}. Tried: ${candidatePaths.join(', ')}`)
    }

    return resolvedPath
  }

  /**
   * Extract all variable names from a template
   *
   * @param template - Template string with {{variable}} syntax
   * @returns Set of variable names found in template
   */
  private extractVariables(template: string): Set<string> {
    const variables = new Set<string>()
    const regex = /\{\{(\w+)\}\}/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(template)) !== null) {
      variables.add(match[1])
    }
    return variables
  }

  /**
   * Validate that supplied variables match template variables exactly
   *
   * @param templateVars - Variables found in the template
   * @param suppliedVars - Variables supplied by the caller
   * @param promptName - Name of the prompt (for error messages)
   * @throws Error if variables don't match
   */
  private validateVariables(templateVars: Set<string>, suppliedVars: Record<string, any>, promptName: string): void {
    const suppliedKeys = new Set(Object.keys(suppliedVars))

    // Check for missing variables (in template but not supplied)
    const missingVars = Array.from(templateVars).filter((v) => !suppliedKeys.has(v))
    if (missingVars.length > 0) {
      throw new Error(`Missing variables for prompt '${promptName}': ${missingVars.join(', ')}`)
    }

    // Check for extra variables (supplied but not in template)
    const extraVars = Array.from(suppliedKeys).filter((v) => !templateVars.has(v))
    if (extraVars.length > 0) {
      throw new Error(`Extra variables supplied for prompt '${promptName}': ${extraVars.join(', ')}`)
    }
  }

  /**
   * Replace {{variable}} placeholders with actual values
   *
   * @param template - Template string with {{variable}} syntax
   * @param variables - Object with variable values
   * @returns Compiled string with variables replaced
   */
  private replaceVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = variables[key]
      // Convert to string, handling null/undefined
      return value === null || value === undefined ? '' : String(value)
    })
  }

  /**
   * Get a compiled prompt with variables substituted
   *
   * @param name - Prompt name (e.g., 'system', 'tools/create_document')
   * @param variables - Variables to substitute
   * @param provider - Optional provider name for provider-specific prompt resolution
   * @returns Compiled prompt string
   */
  getPrompt(name: string, variables: Record<string, any> = {}, provider?: PromptProviderName): string {
    const template = this.loadPrompt(name, provider)
    const templateVars = this.extractVariables(template)
    this.validateVariables(templateVars, variables, name)
    return this.replaceVariables(template, variables)
  }

  /**
   * Combine multiple prompts into one with optional separator
   * Useful for composing complex prompts from modular pieces
   *
   * @param names - Array of prompt names to combine
   * @param variables - Variables to substitute across all prompts
   * @param separator - String to place between prompts (default: double newline)
   * @param provider - Optional provider name for provider-specific prompt resolution
   * @returns Combined and compiled prompt string
   */
  combinePrompts(
    names: string[],
    variables: Record<string, any> = {},
    separator: string = '\n\n',
    provider?: PromptProviderName
  ): string {
    const templates = names.map((name) => this.loadPrompt(name, provider))
    const combined = templates.join(separator)
    const combinedName = names.join(' + ')
    const templateVars = this.extractVariables(combined)
    this.validateVariables(templateVars, variables, combinedName)
    return this.replaceVariables(combined, variables)
  }

  /**
   * Clear the prompt cache (useful for development/testing)
   */
  clearCache(): void {
    this.promptCache.clear()
  }
}

// Singleton instance
export const promptManager = new PromptManager()
