//! `stack.yaml` validated and projected into `b10x-agent-stack/v1`, plus the site provenance
//! manifest the Pages workflow checks.

use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::Path;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "b10x-agent-stack/v1";
pub const DEFAULT_SOURCE: &str = "stack.yaml";
pub const DEFAULT_OUT: &str = "site/src/generated/agent-stack.json";
pub const GITHUB_ORGANIZATION: &str = "https://github.com/beyond10x";
pub const SITE_SCHEMA: &str = "b10x-project-site/v1";
pub const SITE_REPOSITORY: &str = "agent-stack";
pub const SITE_BASE_URL: &str = "/agent-stack/";
const DEFINITION_LIMIT: usize = 160;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum NodeKind {
    Repository,
    Library,
    Vendor,
    Provider,
    Product,
    Actor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Active,
    Paused,
    Proposed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum EdgeKind {
    Calls,
    BuildsOn,
    Drives,
    Contains,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Layer {
    pub id: String,
    pub rank: u32,
    pub name: String,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceNode {
    pub id: String,
    pub label: String,
    pub layer: String,
    pub kind: NodeKind,
    pub status: Status,
    pub definition: String,
    pub repository: Option<String>,
    pub public: bool,
    pub docs: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Flow {
    pub id: String,
    pub label: String,
    pub steps: Vec<String>,
}

/// The authored `stack.yaml`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub schema: String,
    pub layers: Vec<Layer>,
    pub nodes: Vec<SourceNode>,
    pub edges: Vec<Edge>,
    pub flows: Vec<Flow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Node {
    pub id: String,
    pub label: String,
    pub layer: String,
    pub kind: NodeKind,
    pub status: Status,
    pub definition: String,
    pub repository: Option<String>,
    pub github: Option<String>,
    pub docs: Option<String>,
}

/// `b10x-agent-stack/v1`; field order is the contract's key order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Document {
    pub schema: String,
    pub layers: Vec<Layer>,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub flows: Vec<Flow>,
}

pub fn parse(text: &str) -> Result<Source> {
    serde_yaml_ng::from_str(text).context("not a valid b10x-agent-stack/v1 source")
}

fn is_kebab(id: &str) -> bool {
    !id.is_empty()
        && !id.starts_with('-')
        && !id.ends_with('-')
        && !id.contains("--")
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn is_repository_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_'))
}

fn check_one_line(what: &str, text: &str) -> Result<()> {
    if text.trim().is_empty() {
        bail!("{what} is empty");
    }
    if text.contains('\n') || text.contains('\r') {
        bail!("{what} contains a newline");
    }
    if text.trim() != text {
        bail!("{what} has leading or trailing whitespace");
    }
    Ok(())
}

fn check_definition(id: &str, definition: &str) -> Result<()> {
    let what = format!("node {id} definition");
    check_one_line(&what, definition)?;
    let length = definition.chars().count();
    if length > DEFINITION_LIMIT {
        bail!("{what} is {length} characters; at most {DEFINITION_LIMIT}");
    }
    let Some(body) = definition.strip_suffix('.') else {
        bail!("{what} must be one sentence ending with a period");
    };
    for terminator in [". ", "! ", "? "] {
        if body.contains(terminator) {
            bail!("{what} must be one sentence; found {terminator:?} inside it");
        }
    }
    Ok(())
}

/// Validate the source against the contract's invariants and project it.
pub fn project(source: &Source) -> Result<Document> {
    if source.schema != SCHEMA {
        bail!("schema is {:?}; expected {SCHEMA:?}", source.schema);
    }
    if source.layers.is_empty() || source.nodes.is_empty() {
        bail!("the stack needs at least one layer and one node");
    }

    let mut layers = BTreeSet::new();
    let mut ranks = BTreeSet::new();
    for layer in &source.layers {
        if layer.id.is_empty()
            || !layer
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            bail!("layer id {:?} is not an identifier", layer.id);
        }
        if !layers.insert(layer.id.as_str()) {
            bail!("duplicate layer id {}", layer.id);
        }
        if !ranks.insert(layer.rank) {
            bail!("duplicate layer rank {} at layer {}", layer.rank, layer.id);
        }
        check_one_line(&format!("layer {} name", layer.id), &layer.name)?;
        check_one_line(&format!("layer {} summary", layer.id), &layer.summary)?;
    }

    let mut nodes = Vec::with_capacity(source.nodes.len());
    let mut node_ids = BTreeSet::new();
    for node in &source.nodes {
        if !is_kebab(&node.id) {
            bail!("node id {:?} is not kebab-case", node.id);
        }
        if !node_ids.insert(node.id.as_str()) {
            bail!("duplicate node id {}", node.id);
        }
        if !layers.contains(node.layer.as_str()) {
            bail!("node {} names unknown layer {}", node.id, node.layer);
        }
        check_one_line(&format!("node {} label", node.id), &node.label)?;
        check_definition(&node.id, &node.definition)?;
        match (node.kind, &node.repository) {
            (NodeKind::Repository | NodeKind::Library, None) => {
                bail!("node {} is a {:?} without a repository", node.id, node.kind)
            }
            (NodeKind::Vendor | NodeKind::Provider | NodeKind::Actor, Some(repository)) => bail!(
                "node {} is a {:?} and cannot name beyond10x repository {repository}",
                node.id,
                node.kind
            ),
            _ => {}
        }
        if let Some(repository) = &node.repository {
            if !is_repository_name(repository) {
                bail!(
                    "node {} repository {repository:?} is not a repository name",
                    node.id
                );
            }
        } else if node.public {
            bail!("node {} is public: true but names no repository", node.id);
        }
        let github = match &node.repository {
            Some(repository) if node.public => Some(format!("{GITHUB_ORGANIZATION}/{repository}")),
            _ => None,
        };
        if let Some(docs) = &node.docs
            && (!docs.starts_with('/') || !docs.ends_with('/') || docs.contains("//"))
        {
            bail!(
                "node {} docs route {docs:?} must be site-relative, starting and ending with /",
                node.id
            );
        }
        nodes.push(Node {
            id: node.id.clone(),
            label: node.label.clone(),
            layer: node.layer.clone(),
            kind: node.kind,
            status: node.status,
            definition: node.definition.clone(),
            repository: node.repository.clone(),
            github,
            docs: node.docs.clone(),
        });
    }

    let mut joined = BTreeSet::new();
    let mut seen_edges = BTreeSet::new();
    for edge in &source.edges {
        for end in [&edge.from, &edge.to] {
            if !node_ids.contains(end.as_str()) {
                bail!("edge {} -> {} names unknown node {end}", edge.from, edge.to);
            }
        }
        if edge.from == edge.to {
            bail!("edge {} -> {} joins a node to itself", edge.from, edge.to);
        }
        if !seen_edges.insert((edge.from.as_str(), edge.to.as_str(), edge.kind)) {
            bail!(
                "duplicate {:?} edge {} -> {}",
                edge.kind,
                edge.from,
                edge.to
            );
        }
        check_one_line(
            &format!("edge {} -> {} label", edge.from, edge.to),
            &edge.label,
        )?;
        joined.insert((edge.from.as_str(), edge.to.as_str()));
        joined.insert((edge.to.as_str(), edge.from.as_str()));
    }

    let mut flow_ids = BTreeSet::new();
    for flow in &source.flows {
        if !is_kebab(&flow.id) {
            bail!("flow id {:?} is not kebab-case", flow.id);
        }
        if !flow_ids.insert(flow.id.as_str()) {
            bail!("duplicate flow id {}", flow.id);
        }
        check_one_line(&format!("flow {} label", flow.id), &flow.label)?;
        if flow.steps.len() < 2 {
            bail!("flow {} needs at least two steps", flow.id);
        }
        for step in &flow.steps {
            if !node_ids.contains(step.as_str()) {
                bail!("flow {} names unknown node {step}", flow.id);
            }
        }
        for pair in flow.steps.windows(2) {
            if !joined.contains(&(pair[0].as_str(), pair[1].as_str())) {
                bail!(
                    "flow {} steps {} -> {} are not joined by an edge",
                    flow.id,
                    pair[0],
                    pair[1]
                );
            }
        }
    }

    Ok(Document {
        schema: source.schema.clone(),
        layers: source.layers.clone(),
        nodes,
        edges: source.edges.clone(),
        flows: source.flows.clone(),
    })
}

/// UTF-8, 2-space indent, keys in contract order, trailing newline.
pub fn render(document: &Document) -> Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(document)?;
    bytes.push(b'\n');
    Ok(bytes)
}

/// The first differing line, so a drift names what moved.
fn describe_drift(expected: &[u8], actual: &[u8]) -> String {
    let expected = String::from_utf8_lossy(expected);
    let actual = String::from_utf8_lossy(actual);
    let mut expected_lines = expected.lines();
    let mut actual_lines = actual.lines();
    let mut line = 0usize;
    loop {
        line += 1;
        match (expected_lines.next(), actual_lines.next()) {
            (None, None) => return "trailing bytes differ".to_string(),
            (Some(want), Some(have)) if want == have => continue,
            (want, have) => {
                return format!(
                    "first difference at line {line}: expected {:?}, found {:?}",
                    want.unwrap_or("<end of file>"),
                    have.unwrap_or("<end of file>")
                );
            }
        }
    }
}

/// Read, validate and render `source`.
pub fn generate(source: &Path) -> Result<Vec<u8>> {
    let text = fs::read_to_string(source).with_context(|| format!("read {}", source.display()))?;
    let document = parse(&text)
        .and_then(|parsed| project(&parsed))
        .with_context(|| source.display().to_string())?;
    render(&document)
}

/// Write `rendered` to `out` when it differs, or with `check` refuse the drift without writing.
/// Returns whether the file changed.
pub fn write_or_check(out: &Path, rendered: &[u8], check: bool) -> Result<bool> {
    let current = match fs::read(out) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error).with_context(|| format!("read {}", out.display())),
    };
    if current.as_deref() == Some(rendered) {
        return Ok(false);
    }
    if check {
        match current {
            None => bail!(
                "drift: {} is missing; run `agent-stack generate`",
                out.display()
            ),
            Some(current) => bail!(
                "drift: {} is not the projection of stack.yaml ({}); run `agent-stack generate`",
                out.display(),
                describe_drift(rendered, &current)
            ),
        }
    }
    let parent = match out.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .with_context(|| format!("create a temporary file in {}", parent.display()))?;
    temporary.write_all(rendered)?;
    temporary.flush()?;
    temporary
        .persist(out)
        .with_context(|| format!("replace {}", out.display()))?;
    Ok(true)
}

/// The `b10x-project-site/v1` manifest for a full lowercase 40-hex commit.
pub fn site_manifest(commit: &str) -> Result<String> {
    if commit.len() != 40
        || !commit
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        bail!("commit {commit:?} must be a full Git revision: 40 lowercase hexadecimal characters");
    }
    if commit.bytes().all(|b| b == b'0') {
        bail!("commit must not be the zero revision");
    }
    Ok(format!(
        "{{\n  \"schema\": \"{SITE_SCHEMA}\",\n  \"repository\": \"{SITE_REPOSITORY}\",\n  \"commit\": \"{commit}\",\n  \"baseUrl\": \"{SITE_BASE_URL}\"\n}}\n"
    ))
}

/// Write `<site>/.well-known/b10x-site.json` and `<site>/.nojekyll` into a built site.
pub fn write_provenance(site: &Path, commit: &str) -> Result<()> {
    let manifest = site_manifest(commit)?;
    if !site.join("index.html").is_file() {
        bail!(
            "{} holds no built site: index.html is missing",
            site.display()
        );
    }
    let well_known = site.join(".well-known");
    fs::create_dir_all(&well_known).with_context(|| format!("create {}", well_known.display()))?;
    fs::write(well_known.join("b10x-site.json"), manifest).context("write site provenance")?;
    fs::write(site.join(".nojekyll"), "").context("write .nojekyll")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"
schema: b10x-agent-stack/v1
layers:
  - {id: L2, rank: 3, name: Meta-harness, summary: Starts any harness.}
  - {id: L0, rank: 1, name: Model call, summary: One turn.}
  - {id: provider, rank: 0, name: Model providers, summary: Endpoints.}
nodes:
  - {id: metaharness, label: metaharness, layer: L2, kind: repository, status: active, definition: Starts any harness., repository: metaharness, public: true, docs: /metaharness/}
  - {id: llm, label: llm, layer: L0, kind: repository, status: active, definition: One turn in and one out., repository: llm, public: false, docs: /llm/}
  - {id: anthropic, label: Anthropic, layer: provider, kind: provider, status: active, definition: A hosted provider., repository: null, public: false, docs: null}
edges:
  - {from: metaharness, to: llm, kind: calls, label: a turn}
  - {from: llm, to: anthropic, kind: builds-on, label: Messages API}
flows:
  - {id: work, label: Work, steps: [metaharness, llm, anthropic]}
"#;

    fn source() -> Source {
        parse(VALID).unwrap()
    }

    fn error(source: &Source) -> String {
        format!("{:#}", project(source).unwrap_err())
    }

    #[test]
    fn github_is_emitted_only_for_a_public_repository() {
        let document = project(&source()).unwrap();
        assert_eq!(
            document.nodes[0].github.as_deref(),
            Some("https://github.com/beyond10x/metaharness")
        );
        assert_eq!(document.nodes[1].github, None);
        assert_eq!(document.nodes[2].github, None);
    }

    #[test]
    fn public_without_a_repository_is_refused() {
        let mut source = source();
        source.nodes[2].public = true;
        assert!(error(&source).contains("names no repository"));
    }

    #[test]
    fn output_is_byte_stable_and_in_contract_key_order() {
        let first = render(&project(&source()).unwrap()).unwrap();
        let second = render(&project(&parse(VALID).unwrap()).unwrap()).unwrap();
        assert_eq!(first, second);
        let text = String::from_utf8(first).unwrap();
        assert!(text.ends_with("}\n"));
        assert!(text.starts_with("{\n  \"schema\": \"b10x-agent-stack/v1\",\n  \"layers\": ["));
        assert!(!text.contains("\"public\""));
        assert!(text.contains("\"kind\": \"builds-on\""));
        let node = text.find("\"id\": \"metaharness\"").unwrap();
        let order: Vec<usize> = [
            "\"label\":",
            "\"layer\":",
            "\"kind\":",
            "\"status\":",
            "\"definition\":",
            "\"repository\":",
            "\"github\":",
            "\"docs\":",
        ]
        .iter()
        .map(|key| node + text[node..].find(key).unwrap())
        .collect();
        assert!(order.windows(2).all(|pair| pair[0] < pair[1]), "{order:?}");
        let top: Vec<usize> = ["\"layers\":", "\"nodes\":", "\"edges\":", "\"flows\":"]
            .iter()
            .map(|key| text.find(key).unwrap())
            .collect();
        assert!(top.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn the_wrong_schema_is_refused() {
        let mut source = source();
        source.schema = "b10x-agent-stack/v2".into();
        assert!(error(&source).contains("schema"));
    }

    #[test]
    fn a_node_on_an_unknown_layer_is_refused() {
        let mut source = source();
        source.nodes[0].layer = "L9".into();
        assert!(error(&source).contains("unknown layer L9"));
    }

    #[test]
    fn duplicate_layers_and_ranks_are_refused() {
        let mut source = source();
        source.layers[1].id = "L2".into();
        assert!(error(&source).contains("duplicate layer id L2"));
        let mut source = self::source();
        source.layers[1].rank = 3;
        assert!(error(&source).contains("duplicate layer rank 3"));
    }

    #[test]
    fn node_ids_are_unique_kebab_case() {
        let mut source = source();
        source.nodes[1].id = "metaharness".into();
        assert!(error(&source).contains("duplicate node id"));
        let mut source = self::source();
        source.nodes[0].id = "Meta_Harness".into();
        assert!(error(&source).contains("not kebab-case"));
    }

    #[test]
    fn an_edge_to_an_unknown_node_is_refused() {
        let mut source = source();
        source.edges[0].to = "nowhere".into();
        assert!(error(&source).contains("unknown node nowhere"));
    }

    #[test]
    fn a_self_edge_and_a_duplicate_edge_are_refused() {
        let mut source = source();
        source.edges[0].to = "metaharness".into();
        assert!(error(&source).contains("itself"));
        let mut source = self::source();
        source.edges.push(source.edges[0].clone());
        assert!(error(&source).contains("duplicate"));
    }

    #[test]
    fn a_flow_step_on_an_unknown_node_is_refused() {
        let mut source = source();
        source.flows[0].steps.push("nowhere".into());
        assert!(error(&source).contains("flow work names unknown node nowhere"));
    }

    #[test]
    fn consecutive_flow_steps_must_share_an_edge() {
        let mut source = source();
        source.flows[0].steps = vec!["metaharness".into(), "anthropic".into()];
        assert!(error(&source).contains("not joined by an edge"));
    }

    #[test]
    fn a_flow_may_walk_an_edge_against_its_direction() {
        let mut source = source();
        source.flows[0].steps = vec!["anthropic".into(), "llm".into()];
        assert!(project(&source).is_ok());
    }

    #[test]
    fn a_flow_needs_two_steps_and_a_unique_id() {
        let mut source = source();
        source.flows[0].steps.truncate(1);
        assert!(error(&source).contains("at least two steps"));
        let mut source = self::source();
        source.flows.push(source.flows[0].clone());
        assert!(error(&source).contains("duplicate flow id"));
    }

    #[test]
    fn repository_presence_follows_the_node_kind() {
        let mut source = source();
        source.nodes[0].repository = None;
        source.nodes[0].public = false;
        assert!(error(&source).contains("without a repository"));
        let mut source = self::source();
        source.nodes[2].repository = Some("llm".into());
        assert!(error(&source).contains("cannot name"));
        let mut source = self::source();
        source.nodes[0].repository = Some("meta/harness".into());
        assert!(error(&source).contains("not a repository name"));
    }

    #[test]
    fn a_definition_is_one_short_sentence_on_one_line() {
        let cases = [
            ("x".repeat(160) + ".", "characters"),
            ("Two sentences. Here.".to_string(), "one sentence"),
            ("No period".to_string(), "ending with a period"),
            ("Line\nbreak.".to_string(), "newline"),
            (String::new(), "empty"),
        ];
        for (definition, expected) in cases {
            let mut source = source();
            source.nodes[0].definition = definition.clone();
            let message = error(&source);
            assert!(message.contains(expected), "{definition:?}: {message}");
        }
        let mut source = source();
        source.nodes[0].definition = "é".repeat(159) + ".";
        assert!(project(&source).is_ok());
    }

    #[test]
    fn a_docs_route_is_site_relative() {
        let mut source = source();
        source.nodes[0].docs = Some("https://example.org/".into());
        assert!(error(&source).contains("site-relative"));
    }

    #[test]
    fn unknown_fields_kinds_and_a_missing_public_are_refused() {
        assert!(parse(&VALID.replace("schema: b10x", "extra: 1\nschema: b10x")).is_err());
        assert!(parse(&VALID.replace("kind: provider", "kind: vendorish")).is_err());
        assert!(parse(&VALID.replace("status: active", "status: frozen")).is_err());
        assert!(parse(&VALID.replace("public: true, ", "")).is_err());
    }

    #[test]
    fn check_names_drift_and_never_writes() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site/src/generated/agent-stack.json");
        let rendered = render(&project(&source()).unwrap()).unwrap();
        let missing = write_or_check(&out, &rendered, true).unwrap_err();
        assert!(format!("{missing:#}").contains("missing"));
        assert!(!out.exists());

        assert!(write_or_check(&out, &rendered, false).unwrap());
        assert_eq!(fs::read(&out).unwrap(), rendered);
        assert!(!write_or_check(&out, &rendered, false).unwrap());
        assert!(!write_or_check(&out, &rendered, true).unwrap());

        let stale = String::from_utf8(rendered.clone())
            .unwrap()
            .replace("Messages API", "Messages")
            .into_bytes();
        fs::write(&out, &stale).unwrap();
        let drift = format!("{:#}", write_or_check(&out, &rendered, true).unwrap_err());
        assert!(drift.contains("first difference at line"), "{drift}");
        assert_eq!(fs::read(&out).unwrap(), stale);
    }

    #[test]
    fn the_committed_stack_validates_and_carries_the_required_flows() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let source = root.join(DEFAULT_SOURCE);
        let first = generate(&source).unwrap();
        assert_eq!(first, generate(&source).unwrap());
        let text = fs::read_to_string(&source).unwrap();
        let document = project(&parse(&text).unwrap()).unwrap();
        let flows: BTreeSet<&str> = document.flows.iter().map(|flow| flow.id.as_str()).collect();
        assert!(flows.contains("agent-work") && flows.contains("loom-decision"));
    }

    #[test]
    fn provenance_names_the_commit_and_refuses_a_bad_one() {
        assert!(site_manifest("abc").is_err());
        assert!(site_manifest(&"0".repeat(40)).is_err());
        assert!(site_manifest(&"g".repeat(40)).is_err());
        assert!(site_manifest(&"A".repeat(40)).is_err());
        let commit = "0123456789abcdef0123456789abcdef01234567";
        let site = tempfile::tempdir().unwrap();
        assert!(write_provenance(site.path(), commit).is_err());
        assert!(!site.path().join(".well-known").exists());
        fs::write(site.path().join("index.html"), "<html></html>").unwrap();
        write_provenance(site.path(), commit).unwrap();
        let written = fs::read_to_string(site.path().join(".well-known/b10x-site.json")).unwrap();
        assert_eq!(
            written,
            format!(
                "{{\n  \"schema\": \"b10x-project-site/v1\",\n  \"repository\": \"agent-stack\",\n  \"commit\": \"{commit}\",\n  \"baseUrl\": \"/agent-stack/\"\n}}\n"
            )
        );
        let manifest: serde_json::Value = serde_json::from_str(&written).unwrap();
        assert_eq!(manifest["schema"], "b10x-project-site/v1");
        assert_eq!(manifest["repository"], "agent-stack");
        assert_eq!(manifest["commit"], commit);
        assert_eq!(manifest["baseUrl"], "/agent-stack/");
        assert!(site.path().join(".nojekyll").is_file());
    }
}
