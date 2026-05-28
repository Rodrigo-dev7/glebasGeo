# GlebasGEO

Aplicacao web para validacao geoespacial de glebas, analise territorial, consulta de CAR, cruzamento com bases ambientais e exportacao de relatorios em Excel.

<img width="1421" height="759" alt="tela 2" src="https://github.com/user-attachments/assets/2e968bdf-c54e-43e3-aa8d-2041d4f691e1" />


## Visao geral

O GlebasGEO foi construido com React + Vite e usa Leaflet para renderizacao do mapa. O fluxo principal permite importar glebas, validar geometrias no padrao SICOR, consultar CAR publico, analisar sobreposicoes com bases CAR e ambientais, editar vertices no mapa e gerar relatorio consolidado.

Fluxo resumido:

1. Importar glebas por Excel, GeoJSON/JSON ou entrada manual.
2. Normalizar os dados para GeoJSON.
3. Validar a geometria da gleba no padrao SICOR.
4. Enriquecer a gleba com area, municipio e UF.
5. Comparar a gleba com bases CAR/KML/SHP importadas.
6. Consultar CAR publico por codigo e exibir sua geometria no mapa.
7. Validar se o CAR consultado sobrepoe Unidade de Conservacao.
8. Usar camadas de analise territorial, como ICMBio, CNUC/MMA, FUNAI e IBGE.
9. Consultar coordenadas contra a base carregada.
10. Editar vertices diretamente no mapa.
11. Exportar relatorio final em `.xlsx`.

## Funcionalidades

### Importacao de glebas

- Importacao de planilhas `.xls` e `.xlsx`.
- Importacao de arquivos `.geojson` e `.json`.
- Inclusao manual de glebas por texto, com pontos de latitude e longitude.
- Agrupamento automatico dos pontos por gleba.
- Normalizacao das geometrias para `FeatureCollection`.
- Preservacao de metadados de origem, como arquivo, planilha, linhas e quantidade de glebas.

### Validacao SICOR

- Validacao de fechamento do anel da gleba.
- Deteccao de ausencia da repeticao final obrigatoria do primeiro ponto.
- Deteccao de repeticao excedente do primeiro ponto.
- Deteccao de vertices repetidos.
- Deteccao de sobreposicao, cruzamento ou autointerseccao no perimetro.
- Marcacao individual dos vertices com erro.
- Classificacao das glebas por status: valida, invalida ou pendente.
- Calculo de metricas tecnicas da validacao, como total de pontos, pontos unicos e segmentos sobrepostos.

### Mapa interativo

- Visualizacao em mapa escuro ou satelite.
- Renderizacao das glebas por status de validacao.
- Popups com detalhes da gleba, area, municipio, UF, origem e criticas.
- Lista lateral com selecao, filtros e controle de visibilidade das glebas.
- Alternancia entre mostrar marcadores, pontos validados ou ocultar pontos.
- Centralizacao automatica no mapa apos importacao, consulta, selecao ou edicao.
- Destaque visual de glebas selecionadas, pontos consultados e correspondencias encontradas.

### Edicao de vertices

- Edicao dos vertices diretamente no mapa.
- Recalculo da area apos alteracao.
- Reprocessamento da geometria editada.
- Atualizacao da validacao SICOR apos movimentar pontos.
- Atualizacao do cruzamento com bases CAR e ambientais quando aplicavel.

### Consulta e analise CAR

- Importacao de bases CAR/KML/KMZ/SHP.
- Suporte a importacao de `.shp` acompanhado de `.dbf`.
- Selecao de multiplas bases CAR e escolha da base ativa.
- Normalizacao e deduplicacao de features CAR.
- Analise de sobreposicao entre glebas e imoveis CAR carregados.
- Deteccao de gleba dentro de CAR ou parcialmente sobreposta.
- Consulta publica de CAR por codigo.
- Exibicao do CAR consultado no mapa.
- Exibicao de status, municipio, UF, area, tipo e situacao de analise do CAR.
- Botao para centralizar o CAR consultado no mapa.

### Validacao ambiental do CAR

- Validacao automatica do CAR consultado contra Unidades de Conservacao.
- Cruzamento com a base nacional CNUC/MMA.
- Fallback para camada federal do ICMBio quando necessario.
- Mensagem compativel com o fluxo SICOR quando houver sobreposicao:

```text
SICOR: Gleba ou CAR informados sobrepoem Unidade de Conservacao.
```

- Exibicao da reserva ambiental sobreposta no modal de consulta CAR.
- Botao para mostrar a reserva ambiental no mapa.
- Destaque da reserva ambiental sobreposta com popup proprio.
- Popup da reserva com nome, categoria, grupo, municipio/UF, area e fonte.

### Analise territorial

O painel **Analise Territorial** permite ativar camadas de apoio para leitura ambiental e cadastral:

- Embargos ICMBio.
- Unidades de Conservacao Federais.
- Reservas Brasil, usando a base nacional CNUC/MMA.
- Terras Indigenas FUNAI.
- Areas Prioritarias para Conservacao no Nordeste.
- Biomas IBGE.
- Camadas por bioma: Caatinga, Cerrado/Pantanal, Mata Atlantica, Amazonia e Zona Costeira.

As camadas WMS permitem consulta por clique quando o servico publica `GetFeatureInfo`. A camada Reservas Brasil usa WMS do CNUC/MMA para exibir as unidades de conservacao em escala nacional sem carregar a base vetorial inteira no navegador.

### Validacao por coordenada

- Consulta de latitude e longitude informadas pelo usuario.
- Verificacao se a coordenada coincide com vertice de gleba.
- Verificacao se a coordenada esta dentro de alguma gleba.
- Destaque do ponto consultado no mapa.
- Destaque das glebas correspondentes.

### Relatorio Excel

- Exportacao de relatorio `.xlsx`.
- Aba de resumo da validacao.
- Aba com base completa.
- Aba de glebas validas.
- Aba de glebas invalidas.
- Aba de criticas SICOR.
- Aba de correspondencias por coordenada.
- Inclusao de informacoes de sobreposicao com CAR quando disponivel.

### Limpeza e controle operacional

- Limpeza da base de glebas importadas.
- Limpeza das bases CAR/KML carregadas.
- Limpeza geral dos dados da aplicacao.
- Controle de filtros por status.
- Controle de visibilidade individual das glebas.

## Formatos suportados

### Entrada de glebas

- `.xls`
- `.xlsx`
- `.geojson`
- `.json`
- texto manual com identificador de gleba, ponto, latitude e longitude

### Bases CAR e KML

- `.kml`
- `.kmz`
- `.shp`
- `.dbf` associado ao `.shp`

### Saida

- `.xlsx`

## Stack

- React 18
- Vite 5
- Leaflet
- React Leaflet
- Three.js
- xlsx
- Tailwind CSS via plugin do Vite

## Como executar

### Pre-requisitos

- Node.js 18 ou superior recomendado
- npm

### Instalacao

```bash
npm install
```

### Desenvolvimento

```bash
npm run dev
```

Aplicacao disponivel por padrao em:

```text
http://localhost:5173
```

### Build de producao

```bash
npm run build
npm run preview
```

## Deploy e proxies

O projeto usa proxies para evitar problemas de CORS nas consultas publicas usadas pela aplicacao.

### Proxies locais no Vite

- `/car-public-api` para API publica do CAR.
- `/car-public-wfs` para WFS da consulta publica do CAR.
- `/icmbio-wms` para camadas ICMBio.
- `/mma-wfs` para base CNUC/MMA.
- `/mma-wms` para visualizacao WMS do CNUC/MMA.
- `/ibge-wms` para camadas IBGE.
- `/funai-wms` para camadas FUNAI.

### Rewrites em producao

O arquivo `vercel.json` publica rewrites para os endpoints usados em producao:

- `/car-public-api`
- `/car-public-wfs`
- `/icmbio-wms`
- `/mma-wfs`
- `/mma-wms`

## Fluxo tecnico

### 1. Importacao da base principal

- Excel: `src/services/excelGeoService.js`
- GeoJSON/JSON: `src/services/datasetImportService.js`
- Texto manual: `src/services/manualGlebaTextService.js`

### 2. Validacao geometrica

- Servico principal: `src/services/sicorGlebaValidationService.js`
- Cada gleba recebe `status`, `errors`, `warnings`, `coordinateStatuses` e `validationMetrics`.

### 3. Enriquecimento geografico

- Servico: `src/services/glebaEnrichmentService.js`
- Calcula area em hectares.
- Resolve municipio e UF a partir de propriedades, bases auxiliares ou lookup administrativo.

### 4. Analise CAR

- Conversao KML/KMZ/SHP: `src/services/kmlGeoService.js`
- Normalizacao CAR: `src/services/carReferenceFeatureService.js`
- Sobreposicao com CAR: `src/services/carOverlapValidationService.js`
- Consulta publica CAR: `src/services/carPublicConsultationService.js`

### 5. Validacao ambiental

- Cruzamento com Unidades de Conservacao: `src/services/environmentalRestrictionService.js`
- Base principal: CNUC/MMA.
- Fallback: ICMBio Federal.

### 6. Consulta por coordenada

- Servico: `src/services/coordinateValidationService.js`
- Compara o ponto informado com vertices e area das glebas carregadas.

### 7. Edicao de geometria

- Servico: `src/services/featureGeometryService.js`
- Gera preview, reconstrucao e reprocessamento das coordenadas editadas.

### 8. Exportacao

- Servico: `src/services/reportService.js`
- Gera workbook Excel com resumo, criticas e correspondencias.

## Estrutura principal

```text
src/
  components/
    CarConsultModal.jsx
    CoordinateValidationPanel.jsx
    FilterBar.jsx
    GlebaAccordionList.jsx
    GlebaDetailModal.jsx
    GlebaPanel.jsx
    GlobeView.jsx
    Legend.jsx
    ManualGlebaModal.jsx
    MapView.jsx
    Sidebar.jsx
  hooks/
    useGlebas.js
  services/
    adminBoundaryService.js
    carContainmentAnalysisService.js
    carOverlapValidationService.js
    carPublicConsultationService.js
    carReferenceFeatureService.js
    coordinateValidationService.js
    datasetImportService.js
    environmentalRestrictionService.js
    excelGeoService.js
    featureGeometryService.js
    glebaEnrichmentService.js
    ibgeMunicipalityService.js
    kmlGeoService.js
    manualGlebaTextService.js
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

## Arquivos importantes

- `src/App.jsx`: composicao principal da aplicacao.
- `src/hooks/useGlebas.js`: estado central, importacoes, filtros, consultas, viewport, validacoes e exportacao.
- `src/components/MapView.jsx`: mapa, camadas territoriais, popups, pontos e edicao de vertices.
- `src/components/CoordinateValidationPanel.jsx`: painel de importacao, biblioteca CAR e acoes principais.
- `src/components/CarConsultModal.jsx`: consulta publica CAR e resultado ambiental.
- `src/services/environmentalRestrictionService.js`: validacao CAR x Unidade de Conservacao.
- `src/services/carPublicConsultationService.js`: consulta publica CAR.
- `src/services/carOverlapValidationService.js`: cruzamento entre gleba e base CAR ativa.
- `src/services/reportService.js`: geracao de relatorio Excel.

## Dados auxiliares

O projeto usa dados locais de apoio geografico:

- `src/data/municipios-uf.json`
- `src/data/ibge-municipios.json`
- `public/base-geoserver-municipios-index.json`
- arquivos em `public/Base-GeoServer/`

Esses arquivos apoiam o enriquecimento de municipio e UF e a organizacao das bases locais.

## Fontes externas usadas

- Consulta publica CAR: `https://consulta.car.gov.br`
- ICMBio / INDE: `https://geoservicos.inde.gov.br/geoserver/ICMBio`
- CNUC/MMA / INDE: `https://geoservicos.inde.gov.br/geoserver/MMA`
- IBGE GeoServer: `https://geoservicos.ibge.gov.br`
- FUNAI GeoServer: `https://geoserver.funai.gov.br`

## Limitacoes atuais

- Nao ha testes automatizados no repositorio neste momento.
- O build de producao pode emitir alerta de chunks grandes no Vite, mas a compilacao conclui normalmente.
- Parte relevante da logica de mapa esta concentrada em `MapView.jsx`.
- Servicos externos podem sofrer indisponibilidade, lentidao ou mudanca de schema.

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
- `Glebas teste com sobreposicao.xlsx`
- `Area_do_Imovel.shp.kmz`

Esses arquivos podem ser usados para testes manuais durante o desenvolvimento.
