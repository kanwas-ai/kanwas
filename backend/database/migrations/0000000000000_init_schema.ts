import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bootstrap migration — materializes the full schema in a single step.
 *
 * Replaces the per-change migration history used during private development.
 * For a database that was migrated incrementally before the squash, insert
 * this filename into `adonis_schema` manually with the next batch number
 * to mark it as applied before running `migration:run`.
 */
export default class InitSchema extends BaseSchema {
  async up() {
    this.schema.raw(`
--

--
-- Name: auth_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_access_tokens (
    id integer NOT NULL,
    tokenable_id uuid NOT NULL,
    type character varying(255) NOT NULL,
    name character varying(255),
    hash character varying(255) NOT NULL,
    abilities text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone
);

--
-- Name: auth_access_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_access_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: auth_access_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_access_tokens_id_seq OWNED BY public.auth_access_tokens.id;

--
-- Name: default_workspace_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.default_workspace_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    source_workspace_id uuid,
    exported_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: document_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    note_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    long_hash_id character varying(255) NOT NULL,
    access_mode character varying(32) NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    name text NOT NULL,
    CONSTRAINT document_shares_access_mode_check CHECK (((access_mode)::text = ANY ((ARRAY['readonly'::character varying, 'editable'::character varying])::text[])))
);

--
-- Name: invocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    canvas_id character varying(255),
    user_id uuid,
    parent_invocation_id uuid,
    query text NOT NULL,
    agent_state jsonb,
    files jsonb,
    yolo_mode boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    snapshot_commit_hash character varying(255),
    flow_type character varying(255) DEFAULT 'product-agent'::character varying,
    source character varying(255)
);

--
-- Name: llm_default_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_default_configs (
    id character varying(255) DEFAULT 'global'::character varying NOT NULL,
    llm_provider character varying(255),
    llm_model character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone
);

--
-- Name: o_auth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.o_auth_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(255) NOT NULL,
    provider_user_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    provider_data jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone
);

--
-- Name: oauth_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state_hash character varying(128) NOT NULL,
    invite_id uuid,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    onboarding_session_token character varying(255)
);

--
-- Name: organization_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    token_hash character varying(128) NOT NULL,
    created_by uuid NOT NULL,
    role_to_grant character varying(255) DEFAULT 'member'::character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    consumed_at timestamp with time zone,
    consumed_by_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    invitee_name character varying(80) NOT NULL
);

--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: organization_usage_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_usage_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    period_type character varying(255) NOT NULL,
    period_start_utc timestamp with time zone NOT NULL,
    period_end_utc timestamp with time zone NOT NULL,
    total_cost_cents integer DEFAULT 0 NOT NULL,
    synced_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT organization_usage_periods_period_type_chk CHECK (((period_type)::text = ANY ((ARRAY['weekly_7d'::character varying, 'monthly_billing_cycle'::character varying])::text[]))),
    CONSTRAINT organization_usage_periods_total_cost_non_negative_chk CHECK ((total_cost_cents >= 0)),
    CONSTRAINT organization_usage_periods_window_chk CHECK ((period_end_utc > period_start_utc))
);

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    weekly_limit_cents integer DEFAULT 5000 NOT NULL,
    monthly_limit_cents integer DEFAULT 5000 NOT NULL,
    billing_cycle_anchor_utc timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizations_monthly_limit_non_negative_chk CHECK ((monthly_limit_cents >= 0)),
    CONSTRAINT organizations_weekly_limit_non_negative_chk CHECK ((weekly_limit_cents >= 0)),
    CONSTRAINT organizations_weekly_within_monthly_chk CHECK ((weekly_limit_cents <= monthly_limit_cents))
);

--
-- Name: skill_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL
);

--
-- Name: skill_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_usages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_id uuid,
    skill_name character varying(64) NOT NULL,
    workspace_id uuid NOT NULL,
    conversation_id character varying(64) NOT NULL,
    source text NOT NULL,
    invoked_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT skill_usages_source_check CHECK ((source = ANY (ARRAY['command'::text, 'agent'::text])))
);

--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name character varying(64) NOT NULL,
    body text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone
);

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    root_invocation_id uuid NOT NULL,
    latest_invocation_id uuid NOT NULL,
    status text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    archived_at timestamp with time zone,
    modified_folders jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'processing'::text, 'waiting'::text, 'complete'::text, 'error'::text])))
);

--
-- Name: user_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    workspace_id uuid
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(254) NOT NULL,
    password character varying(180),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    name character varying(80) NOT NULL
);

--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(254) NOT NULL,
    company_url character varying(2048),
    role character varying(255),
    number_of_pms character varying(50),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone
);

--
-- Name: workspace_git_repos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_git_repos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    remote_url character varying(255),
    last_commit_hash character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: workspace_suggested_task_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_suggested_task_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    is_loading boolean DEFAULT false NOT NULL,
    tasks jsonb DEFAULT '[]'::jsonb NOT NULL,
    error_message text,
    generated_at timestamp with time zone,
    loading_started_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: workspace_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_users (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    organization_id uuid NOT NULL,
    onboarding_completed boolean DEFAULT false,
    onboarding_chapter integer DEFAULT 0,
    personality_traits jsonb
);

--
-- Name: auth_access_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_access_tokens ALTER COLUMN id SET DEFAULT nextval('public.auth_access_tokens_id_seq'::regclass);

--
-- Name: auth_access_tokens auth_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_access_tokens
    ADD CONSTRAINT auth_access_tokens_pkey PRIMARY KEY (id);

--
-- Name: default_workspace_templates default_workspace_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.default_workspace_templates
    ADD CONSTRAINT default_workspace_templates_pkey PRIMARY KEY (id);

--
-- Name: document_shares document_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_pkey PRIMARY KEY (id);

--
-- Name: invocations invocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invocations
    ADD CONSTRAINT invocations_pkey PRIMARY KEY (id);

--
-- Name: llm_default_configs llm_default_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_default_configs
    ADD CONSTRAINT llm_default_configs_pkey PRIMARY KEY (id);

--
-- Name: o_auth_accounts o_auth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.o_auth_accounts
    ADD CONSTRAINT o_auth_accounts_pkey PRIMARY KEY (id);

--
-- Name: o_auth_accounts o_auth_accounts_provider_provider_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.o_auth_accounts
    ADD CONSTRAINT o_auth_accounts_provider_provider_user_id_unique UNIQUE (provider, provider_user_id);

--
-- Name: oauth_states oauth_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_pkey PRIMARY KEY (id);

--
-- Name: oauth_states oauth_states_state_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_state_hash_unique UNIQUE (state_hash);

--
-- Name: organization_invites organization_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_pkey PRIMARY KEY (id);

--
-- Name: organization_invites organization_invites_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_token_hash_unique UNIQUE (token_hash);

--
-- Name: organization_memberships organization_memberships_organization_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_user_id_unique UNIQUE (organization_id, user_id);

--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);

--
-- Name: organization_usage_periods organization_usage_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_periods
    ADD CONSTRAINT organization_usage_periods_pkey PRIMARY KEY (id);

--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

--
-- Name: skill_preferences skill_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_preferences
    ADD CONSTRAINT skill_preferences_pkey PRIMARY KEY (id);

--
-- Name: skill_preferences skill_preferences_user_id_skill_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_preferences
    ADD CONSTRAINT skill_preferences_user_id_skill_id_unique UNIQUE (user_id, skill_id);

--
-- Name: skill_usages skill_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usages
    ADD CONSTRAINT skill_usages_pkey PRIMARY KEY (id);

--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);

--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

--
-- Name: tasks tasks_root_invocation_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_root_invocation_id_unique UNIQUE (root_invocation_id);

--
-- Name: user_configs user_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configs
    ADD CONSTRAINT user_configs_pkey PRIMARY KEY (id);

--
-- Name: user_configs user_configs_user_id_workspace_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configs
    ADD CONSTRAINT user_configs_user_id_workspace_id_unique UNIQUE (user_id, workspace_id);

--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: waitlist waitlist_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_email_unique UNIQUE (email);

--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);

--
-- Name: workspace_git_repos workspace_git_repos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_git_repos
    ADD CONSTRAINT workspace_git_repos_pkey PRIMARY KEY (id);

--
-- Name: workspace_git_repos workspace_git_repos_workspace_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_git_repos
    ADD CONSTRAINT workspace_git_repos_workspace_id_unique UNIQUE (workspace_id);

--
-- Name: workspace_suggested_task_sets workspace_suggested_task_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_suggested_task_sets
    ADD CONSTRAINT workspace_suggested_task_sets_pkey PRIMARY KEY (id);

--
-- Name: workspace_suggested_task_sets workspace_suggested_task_sets_workspace_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_suggested_task_sets
    ADD CONSTRAINT workspace_suggested_task_sets_workspace_id_unique UNIQUE (workspace_id);

--
-- Name: workspace_users workspace_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_pkey PRIMARY KEY (workspace_id, user_id);

--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

--
-- Name: document_shares_active_note_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_shares_active_note_unique ON public.document_shares USING btree (workspace_id, note_id) WHERE (revoked_at IS NULL);

--
-- Name: document_shares_created_by_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_shares_created_by_user_idx ON public.document_shares USING btree (created_by_user_id);

--
-- Name: document_shares_long_hash_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_shares_long_hash_id_unique ON public.document_shares USING btree (long_hash_id);

--
-- Name: document_shares_workspace_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_shares_workspace_note_idx ON public.document_shares USING btree (workspace_id, note_id);

--
-- Name: oauth_states_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_states_expires_at_index ON public.oauth_states USING btree (expires_at);

--
-- Name: oauth_states_invite_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_states_invite_id_index ON public.oauth_states USING btree (invite_id);

--
-- Name: organization_invites_consumed_by_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_consumed_by_user_id_index ON public.organization_invites USING btree (consumed_by_user_id);

--
-- Name: organization_invites_created_by_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_created_by_index ON public.organization_invites USING btree (created_by);

--
-- Name: organization_invites_organization_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_organization_id_index ON public.organization_invites USING btree (organization_id);

--
-- Name: organization_memberships_org_id_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_org_id_role_idx ON public.organization_memberships USING btree (organization_id, role);

--
-- Name: organization_memberships_organization_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_organization_id_index ON public.organization_memberships USING btree (organization_id);

--
-- Name: organization_memberships_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_user_id_index ON public.organization_memberships USING btree (user_id);

--
-- Name: organization_usage_periods_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_usage_periods_lookup_idx ON public.organization_usage_periods USING btree (organization_id, period_type, period_start_utc DESC);

--
-- Name: organization_usage_periods_unique_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_usage_periods_unique_period_idx ON public.organization_usage_periods USING btree (organization_id, period_type, period_start_utc);

--
-- Name: skill_usages_invoked_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usages_invoked_at_index ON public.skill_usages USING btree (invoked_at);

--
-- Name: skill_usages_skill_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usages_skill_id_index ON public.skill_usages USING btree (skill_id);

--
-- Name: skill_usages_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usages_user_id_index ON public.skill_usages USING btree (user_id);

--
-- Name: skill_usages_workspace_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usages_workspace_id_index ON public.skill_usages USING btree (workspace_id);

--
-- Name: skills_system_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX skills_system_name_unique ON public.skills USING btree (name) WHERE (is_system = true);

--
-- Name: skills_user_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX skills_user_name_unique ON public.skills USING btree (user_id, name) WHERE (is_system = false);

--
-- Name: tasks_latest_invocation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_latest_invocation_idx ON public.tasks USING btree (latest_invocation_id);

--
-- Name: tasks_workspace_user_status_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_workspace_user_status_updated_idx ON public.tasks USING btree (workspace_id, user_id, status, updated_at, id);

--
-- Name: tasks_workspace_user_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_workspace_user_updated_at_idx ON public.tasks USING btree (workspace_id, user_id, updated_at, id);

--
-- Name: workspace_suggested_task_sets_loading_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_suggested_task_sets_loading_idx ON public.workspace_suggested_task_sets USING btree (is_loading, loading_started_at);

--
-- Name: workspaces_organization_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_organization_id_index ON public.workspaces USING btree (organization_id);

--
-- Name: auth_access_tokens auth_access_tokens_tokenable_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_access_tokens
    ADD CONSTRAINT auth_access_tokens_tokenable_id_foreign FOREIGN KEY (tokenable_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: document_shares document_shares_created_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_created_by_user_id_foreign FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

--
-- Name: invocations invocations_parent_invocation_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invocations
    ADD CONSTRAINT invocations_parent_invocation_id_foreign FOREIGN KEY (parent_invocation_id) REFERENCES public.invocations(id) ON DELETE SET NULL;

--
-- Name: invocations invocations_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invocations
    ADD CONSTRAINT invocations_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: invocations invocations_workspace_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invocations
    ADD CONSTRAINT invocations_workspace_id_foreign FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: o_auth_accounts o_auth_accounts_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.o_auth_accounts
    ADD CONSTRAINT o_auth_accounts_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: oauth_states oauth_states_invite_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_invite_id_foreign FOREIGN KEY (invite_id) REFERENCES public.organization_invites(id) ON DELETE SET NULL;

--
-- Name: organization_invites organization_invites_consumed_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_consumed_by_user_id_foreign FOREIGN KEY (consumed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: organization_invites organization_invites_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: organization_invites organization_invites_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

--
-- Name: organization_memberships organization_memberships_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

--
-- Name: organization_memberships organization_memberships_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: organization_usage_periods organization_usage_periods_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_periods
    ADD CONSTRAINT organization_usage_periods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

--
-- Name: skill_preferences skill_preferences_skill_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_preferences
    ADD CONSTRAINT skill_preferences_skill_id_foreign FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;

--
-- Name: skill_preferences skill_preferences_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_preferences
    ADD CONSTRAINT skill_preferences_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: skill_usages skill_usages_skill_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usages
    ADD CONSTRAINT skill_usages_skill_id_foreign FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE SET NULL;

--
-- Name: skill_usages skill_usages_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usages
    ADD CONSTRAINT skill_usages_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: skill_usages skill_usages_workspace_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usages
    ADD CONSTRAINT skill_usages_workspace_id_foreign FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: skills skills_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_latest_invocation_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_latest_invocation_id_foreign FOREIGN KEY (latest_invocation_id) REFERENCES public.invocations(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_root_invocation_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_root_invocation_id_foreign FOREIGN KEY (root_invocation_id) REFERENCES public.invocations(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_workspace_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_workspace_id_foreign FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: user_configs user_configs_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configs
    ADD CONSTRAINT user_configs_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_configs user_configs_workspace_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configs
    ADD CONSTRAINT user_configs_workspace_id_foreign FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_git_repos workspace_git_repos_workspace_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_git_repos
    ADD CONSTRAINT workspace_git_repos_workspace_id_foreign FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_suggested_task_sets workspace_suggested_task_sets_workspace_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_suggested_task_sets
    ADD CONSTRAINT workspace_suggested_task_sets_workspace_id_foreign FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspace_users workspace_users_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: workspace_users workspace_users_workspace_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_workspace_id_foreign FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

--
-- Name: workspaces workspaces_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

`)
  }

  async down() {
    this.schema.raw(`
      DROP TABLE IF EXISTS public.auth_access_tokens CASCADE;
      DROP TABLE IF EXISTS public.default_workspace_templates CASCADE;
      DROP TABLE IF EXISTS public.document_shares CASCADE;
      DROP TABLE IF EXISTS public.invocations CASCADE;
      DROP TABLE IF EXISTS public.llm_default_configs CASCADE;
      DROP TABLE IF EXISTS public.o_auth_accounts CASCADE;
      DROP TABLE IF EXISTS public.oauth_states CASCADE;
      DROP TABLE IF EXISTS public.organization_invites CASCADE;
      DROP TABLE IF EXISTS public.organization_memberships CASCADE;
      DROP TABLE IF EXISTS public.organization_usage_periods CASCADE;
      DROP TABLE IF EXISTS public.organizations CASCADE;
      DROP TABLE IF EXISTS public.skill_preferences CASCADE;
      DROP TABLE IF EXISTS public.skill_usages CASCADE;
      DROP TABLE IF EXISTS public.skills CASCADE;
      DROP TABLE IF EXISTS public.tasks CASCADE;
      DROP TABLE IF EXISTS public.user_configs CASCADE;
      DROP TABLE IF EXISTS public.users CASCADE;
      DROP TABLE IF EXISTS public.waitlist CASCADE;
      DROP TABLE IF EXISTS public.workspace_git_repos CASCADE;
      DROP TABLE IF EXISTS public.workspace_suggested_task_sets CASCADE;
      DROP TABLE IF EXISTS public.workspace_users CASCADE;
      DROP TABLE IF EXISTS public.workspaces CASCADE;
    `)
  }
}
