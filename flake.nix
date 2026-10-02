{
  description = "Reproducible development shell for 2d-lab";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/4975466d324710c576dc11ad614684e6bd8cad8e";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };

          wasmPackAsset =
            if system == "x86_64-linux" then
              {
                target = "x86_64-unknown-linux-musl";
                hash = "sha256-J4qNZoCFgh9NGmN72GTxcT+HKwrjoRjHdWKjCMCr/o0=";
              }
            else
              {
                target = "aarch64-unknown-linux-musl";
                hash = "sha256-WUHHsFBgRA/zfuUP6QCaQI5j+lumB6Owc29aiH7F8so=";
              };

          wasmPack = pkgs.stdenvNoCC.mkDerivation {
            pname = "wasm-pack";
            version = "0.14.0";
            src = pkgs.fetchurl {
              url = "https://github.com/wasm-bindgen/wasm-pack/releases/download/v0.14.0/wasm-pack-v0.14.0-${wasmPackAsset.target}.tar.gz";
              inherit (wasmPackAsset) hash;
            };
            nativeBuildInputs = [
              pkgs.gnutar
              pkgs.gzip
            ];
            dontUnpack = true;
            installPhase = ''
              mkdir -p "$out/bin"
              tar -xzf "$src"
              install -m755 "wasm-pack-v0.14.0-${wasmPackAsset.target}/wasm-pack" "$out/bin/wasm-pack"
            '';
          };
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.git
              pkgs.nodejs_24
              pkgs.rustup
              wasmPack
            ];
          };
        }
      );
    };
}
