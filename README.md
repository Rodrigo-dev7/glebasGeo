# GlebasGEO

Aplicacao web para validacao geoespacial de glebas, com visualizacao em mapa, importacao de arquivos, edicao de vertices e comparacao com imoveis do CAR em KML/KMZ.

## Visao geral

O projeto foi construido com React + Vite e usa Leaflet para renderizacao do mapa. O foco principal hoje e:

- importar glebas em Excel ou GeoJSON
- validar a geometria com regras do fluxo SICOR
- consultar coordenadas contra a base carregada
- editar vertices da gleba diretamente no mapa
- importar uma ou mais bases CAR em `.kml` ou `.kmz`
- visualizar o imovel do CAR no mapa e indicar se a gleba esta dentro ou fora do CAR
- exportar um relatorio JSON com o resultado da validacao

## Funcionalidades atuais

- Mapa interativo com tema escuro e base satelite
- Popup da gleba com area, municipio, localizacao e validacao CAR
- Popup do CAR com numero do CAR, municipio/UF e area
- Edicao de vertices da gleba com atualizacao de area em tempo real
- Filtro de status por `Todas`, `Validas` e `Invalidas`
- Biblioteca lateral de bases CAR importadas, com selecao, remocao e recolhimento
- Deteccao de sobreposicao/interseccao entre gleba e base CAR ativa
- Enriquecimento de municipio, UF e area da gleba
- Exportacao de relatorio em JSON

## Formatos suportados

### Glebas

- `.xls`
- `.xlsx`
- `.geojson`
- `.json`

### Base CAR

- `.kml`
- `.kmz`

## Como executar

### Pre-requisitos

- Node.js 18+ recomendado
- npm

### Instalacao

```bash
npm install
```

### Desenvolvimento

```bash
npm run dev
```

Aplicacao disponivel em `http://localhost:5173`.

### Build de producao

```bash
npm run build
npm run preview
```

## Fluxo de uso

1. Importe a gleba em Excel ou GeoJSON.
2. Visualize as glebas no mapa e selecione uma delas.
3. Se quiser, edite os vertices diretamente no mapa.
4. Importe uma base CAR em KML/KMZ.
5. Se houver mais de uma base CAR, escolha qual delas fica ativa.
6. Clique na gleba ou no imovel do CAR para ver os popups.
7. Use a consulta de coordenadas para verificar se um ponto cai dentro de alguma gleba.
8. Exporte o relatorio JSON quando necessario.

## Estrutura principal

```text
src/
  components/
    CoordinateValidationPanel.jsx
    FilterBar.jsx
    GlebaAccordionList.jsx
    GlebaDetailModal.jsx
    GlebaPanel.jsx
    Legend.jsx
    MapView.jsx
    Sidebar.jsx
  hooks/
    useGlebas.js
  services/
    adminBoundaryService.js
    carOverlapValidationService.js
    coordinateValidationService.js
    datasetImportService.js
    excelGeoService.js
    featureGeometryService.js
    glebaEnrichmentService.js
    ibgeMunicipalityService.js
    kmlGeoService.js
    reportService.js
    sicorGlebaValidationService.js
    validationService.js
  data/
    glebas.json
    ibge-municipios.json
    municipios-uf.json
public/
  base-geoserver-municipios-index.json
Base-GeoServer/
  bases auxiliares locais
```

## Principais arquivos

- `src/hooks/useGlebas.js`: estado central da aplicacao, importacao, filtros, viewport e selecao do CAR ativo
- `src/components/MapView.jsx`: mapa, popups, camadas, animacoes e edicao de vertices
- `src/components/CoordinateValidationPanel.jsx`: importacao de arquivos, biblioteca CAR e validacao por coordenada
- `src/services/datasetImportService.js`: pipeline de importacao de glebas
- `src/services/excelGeoService.js`: leitura e agrupamento de planilhas
- `src/services/kmlGeoService.js`: leitura de KML/KMZ do CAR
- `src/services/carOverlapValidationService.js`: comparacao entre gleba e base CAR
- `src/services/sicorGlebaValidationService.js`: regras geometricas do fluxo SICOR
- `src/services/reportService.js`: geracao e download do relatorio JSON

## Stack atual

- React 18
- Vite 5
- Leaflet
- React Leaflet
- xlsx

## Dados e apoio geografico

O projeto usa dados locais para apoio de enriquecimento e referencia geografica, incluindo:

- bases em `Base-GeoServer/`
- indice em `public/base-geoserver-municipios-index.json`
- arquivos auxiliares em `src/data/`

## Limitacoes atuais

- Nao ha testes automatizados no repositorio neste momento.
- O status `Pendente` foi removido da interface principal e nao faz parte do fluxo atual de uso.
- A validacao CAR exibida no popup da gleba esta orientada ao criterio solicitado no projeto: `Gleba dentro do CAR` ou `Gleba fora do CAR`.
- O build atualmente gera aviso de chunk grande no bundle final do Vite, mas compila normalmente.

## Scripts disponiveis

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

## Arquivos de exemplo no repositorio

O repositorio contem alguns arquivos de apoio e amostras locais, como:

- `TESTE_1_COM ERROS.xls`
- `TESTE_2_COM ERROS.xls`
- `TESTE_3_SEM ERROS.xls`
- `TESTE_4_SEM ERROS.xls`
- `Area_do_Imovel.shp.kmz`

Eles podem ser usados para testes manuais durante o desenvolvimento.
