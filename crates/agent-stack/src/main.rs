use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(version, about = "The beyond10x agent stack as data")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Validate stack.yaml and write the b10x-agent-stack/v1 JSON the site reads.
    Generate {
        /// Typed agent stack source.
        #[arg(long, default_value = agent_stack::DEFAULT_SOURCE)]
        source: PathBuf,
        /// JSON file to write or check.
        #[arg(long, default_value = agent_stack::DEFAULT_OUT)]
        out: PathBuf,
        /// Refuse drift without writing.
        #[arg(long)]
        check: bool,
    },
    /// Write <site>/.well-known/b10x-site.json and b10x-routes.json for a built site.
    Provenance {
        /// Built site directory holding index.html.
        #[arg(long)]
        site: PathBuf,
        /// Full 40-character lowercase Git commit the site was built from.
        #[arg(long)]
        commit: String,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Generate { source, out, check } => {
            let rendered = agent_stack::generate(&source)?;
            let changed = agent_stack::write_or_check(&out, &rendered, check)?;
            let state = match (check, changed) {
                (true, _) => "current",
                (false, true) => "written",
                (false, false) => "unchanged",
            };
            println!("{state}: {}", out.display());
        }
        Command::Provenance { site, commit } => {
            agent_stack::write_provenance(&site, &commit)?;
            for file in ["b10x-site.json", "b10x-routes.json"] {
                println!("written: {}", site.join(".well-known").join(file).display());
            }
        }
    }
    Ok(())
}
