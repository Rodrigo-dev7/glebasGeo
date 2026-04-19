# GlebasGEO

Aplicacao web para validacao geoespacial de glebas, com mapa interativo, importacao de arquivos, edicao de vertices, cruzamento com bases CAR e exportacao de relatorio em Excel.

## Visao geral

O projeto foi construido com React + Vite e usa Leaflet para renderizacao do mapa. O fluxo principal hoje e:

1. importar glebas em Excel ou GeoJSON
2. normalizar os dados para GeoJSON
3. aplicar validacoes geometricas no padrao do fluxo SICOR
4. enriquecer a gleba com area, municipio e UF
5. comparar a gleba com uma base CAR em KML/KMZ/SHP
6. consultar coordenadas contra a base carregada
7. editar vertices diretamente no mapa
8. exportar um relatorio consolidado em `.xlsx`

## Funcionalidades atuais

- Importacao de glebas em `.xls`, `.xlsx`, `.geojson` e `.json`
- Importacao de bases CAR em `.kml`, `.kmz` e `.shp`
- Mapa interativo com alternancia entre base escura e satelite
- Lista lateral de glebas com filtros por status
- Selecao de uma ou mais bases CAR, com escolha da base ativa
- Validacao por coordenada informando se o ponto coincide com vertice ou cai dentro da gleba
- Edicao de vertices no mapa com recalculo de area e reprocessamento da feature
- Deteccao de sobreposicao interna na geometria da gleba
- Deteccao de sobreposicao entre gleba e imoveis da base CAR ativa
- Enriquecimento automatico de municipio, UF e area
- Exportacao de relatorio em Excel com abas de resumo, base completa, criticas e correspondencias

## Regras de validacao implementadas

As validacoes principais estao concentradas no servico SICOR e cobrem:

- fechamento do anel da gleba
- repeticao excedente do primeiro ponto
- ausencia da repeticao final obrigatoria
- vertices repetidos
- sobreposicao ou autointerseccao no perimetro
- marcacao individual de coordenadas com problema

O projeto tambem possui um servico legado de validacao geral para estatisticas e regras auxiliares.

## Formatos suportados

### Glebas

- `.xls`
- `.xlsx`
- `.geojson`
- `.json`

### Base CAR

- `.kml`
- `.kmz`
- `.shp`

### Saida

- `.xlsx`

## Stack

- React 18
- Vite 5
- Leaflet
- React Leaflet
- xlsx

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

## Fluxo tecnico

### 1. Importacao da base principal

- Excel: lido e agrupado por gleba em `src/services/excelGeoService.js`
- GeoJSON: normalizado em `src/services/datasetImportService.js`

### 2. Validacao geometrica

- As features passam por `src/services/sicorGlebaValidationService.js`
- Cada gleba recebe `status`, `errors`, `warnings`, `coordinateStatuses` e metricas

### 3. Enriquecimento geografico

- A area e calculada em hectares
- Municipio e UF podem vir do proprio arquivo, de bases auxiliares locais ou de lookup complementar

### 4. Analise CAR

- Bases KML/KMZ/SHP sao convertidas para GeoJSON em `src/services/kmlGeoService.js`
- A sobreposicao com CAR ativo e aplicada em `src/services/carOverlapValidationService.js`

### 5. Consulta por coordenada

- O ponto informado e comparado com vertices e area da gleba em `src/services/coordinateValidationService.js`

### 6. Exportacao

- O relatorio final e gerado em Excel por `src/services/reportService.js`

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
  bases auxiliares locais em shapefile
```

## Arquivos mais importantes

- `src/App.jsx`: composicao principal da aplicacao
- `src/hooks/useGlebas.js`: estado central, importacoes, filtros, viewport, validacao por coordenada e exportacao
- `src/components/MapView.jsx`: mapa, camadas, popups, pontos e edicao de vertices
- `src/components/CoordinateValidationPanel.jsx`: importacao de arquivos, biblioteca CAR e formulario de consulta
- `src/services/datasetImportService.js`: pipeline de entrada da base principal
- `src/services/excelGeoService.js`: leitura de planilhas e agrupamento das glebas
- `src/services/kmlGeoService.js`: leitura de KML/KMZ/SHP do CAR
- `src/services/sicorGlebaValidationService.js`: validacao geometrica da gleba
- `src/services/carOverlapValidationService.js`: cruzamento entre gleba e base CAR ativa
- `src/services/reportService.js`: geracao do relatorio em Excel

## Dados auxiliares

O projeto usa dados locais de apoio geografico:

- `src/data/municipios-uf.json`
- `src/data/ibge-municipios.json`
- `public/base-geoserver-municipios-index.json`
- arquivos em `Base-GeoServer/`

Esses arquivos apoiam o enriquecimento de municipio e UF e a organizacao das bases locais usadas no projeto.

## Limitacoes atuais

- Nao ha testes automatizados no repositorio neste momento
- O bundle de producao gera alerta de chunk grande no Vite, mas a compilacao conclui normalmente
- Parte da logica de mapa esta concentrada em `MapView.jsx`, que hoje mistura renderizacao e comportamento imperativo do Leaflet
- O servico `validationService.js` parece legado em relacao ao fluxo principal baseado em `sicorGlebaValidationService.js`
- O lookup administrativo pode depender de bases locais e, em alguns cenarios, de consulta complementar

## Scripts disponiveis

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

## Arquivos de exemplo no repositorio

- `TESTE_1_COM ERROS.xls`
- `TESTE_2_COM ERROS.xls`
- `TESTE_3_SEM ERROS.xls`
- `TESTE_4_SEM ERROS.xls`
- `Glebas teste com sobreposição.xlsx`
- `Area_do_Imovel.shp.kmz`

Esses arquivos podem ser usados para testes manuais durante o desenvolvimento.
