import streamlit as st
import pandas as pd
from st_pages import show_pages_from_config
import json

show_pages_from_config()

# Set Streamlit Configuration
st.set_page_config(layout="wide")

# 隐藏所有东西
hide_streamlit_style = """
                <style>
                div[data-testid="stToolbar"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stDecoration"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stStatusWidget"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                #MainMenu {
                visibility: hidden;
                height: 0%;
                }
                header {
                visibility: hidden;
                height: 0%;
                }
                footer {
                visibility: hidden;
                height: 0%;
                }
                </style>
                """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

# Reading the dictionary from the text file
with open('./data/colors.txt', 'r') as file:
    COLORS = json.load(file)


def main():
    # Styling and Layout
    remote_css("https://cdnjs.cloudflare.com/ajax/libs/semantic-ui/2.4.1/semantic.min.css")
    local_css("./data/style.css")

    # Load the data
    df = pd.read_csv('./data/data_for_download.csv')

    # 复制一版给下载
    df_download = df.copy()
    
    # Identify unique energy types and let users select one
    selected_energy = st.sidebar.selectbox(
        'Select Energy Type',
        ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'], index=0)

    # Filter the DataFrame based on the selected energy type
    df = df[df['type'] == selected_energy].reset_index(drop=True)

    df = transform_data(df, selected_energy)

    table_scorecard = get_scorecard(df)
    st.markdown(table_scorecard, unsafe_allow_html=True)

    # 使用 Streamlit 的下载按钮进行一键下载
    if selected_energy == 'total':
        csv_data = df_download[df_download['type'] != 'total'].to_csv(index=False)
    else:
        csv_data = df_download[df_download['type'] == selected_energy].to_csv(index=False)
    st.sidebar.download_button(
        label=f"Download {selected_energy} Data as CSV",
        data=csv_data,
        file_name=f"{selected_energy}_data.csv",
        mime="text/csv"
    )


def current_year_sum(group):
    latest_date_for_country = group['date'].max()
    current_year_data = group[group['date'].dt.year == latest_date_for_country.year]
    return current_year_data[current_year_data['date'] <= latest_date_for_country]['value'].sum()


def last_year_ytd_sum(group):
    latest_date_for_country = group['date'].max()
    lytd_end_date = latest_date_for_country.replace(year=latest_date_for_country.year - 1)
    last_year_data = group[group['date'].dt.year == lytd_end_date.year]
    return last_year_data[last_year_data['date'] <= lytd_end_date]['value'].sum()


def local_css(file_name):
    with open(file_name) as f:
        st.markdown(f'<style>{f.read()}</style>', unsafe_allow_html=True)


def remote_css(url):
    st.markdown(f'<link href="{url}" rel="stylesheet">', unsafe_allow_html=True)


def header_bg(table_type):
    return COLORS.get(table_type, "#BAD2DE")  # A soft warm default color


def read_data_sources_from_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:  # Added encoding='utf-8'
        data = f.read()
        return eval(data)


def transform_data(df, selected_energy):
    df['value'] = df['value'] / 1000 # Gwh to Twh
    df['date'] = pd.to_datetime(df['date'])

    ytd_sum_res = df.groupby('country').apply(current_year_sum)
    lytd_sum_res = df.groupby('country').apply(last_year_ytd_sum)
    percentage_change_res = ((ytd_sum_res - lytd_sum_res) / lytd_sum_res) * 100

    results = [{'country': country,
                'max_date': max(df[df['country'] == country]['date']),
                'total_value': sum(df[df['country'] == country]['value']),
                'row_count': len(df[df['country'] == country])}
               for country in df['country'].unique()]

    df = pd.DataFrame(results)
    df['year_to_date_sum'] = df['country'].map(ytd_sum_res)
    df['percentage_change'] = df['country'].map(percentage_change_res)
    df['test_country'] = df['country']
    df['type'] = selected_energy

    # Adding data sources (assuming you have the function read_data_sources_from_file)
    data_sources = read_data_sources_from_file('./data/data_source.txt')
    df['source'] = df['country'].map(lambda x: data_sources.get(x, [None])[0])
    df['source_url'] = df['country'].map(lambda x: data_sources.get(x, [None, None])[1])
    df['continent'] = df['country'].map(lambda x: data_sources.get(x, [None, None])[2])

    return df


def get_scorecard(df):
    table_scorecard = """
    <style>
        .ui.statistics .statistic .label {
            margin-top: 10px !important; /* The use of !important ensures the style is applied */
        }
    </style>

    <div class="ui three small statistics">
          <div class="grey statistic">
            <div class="value">""" + str(len(df)) + """
            </div>
            <div class="grey label">
              number of countries so far
            </div>
          </div>
            <div class="grey statistic">
                <div class="value">""" + str(min(df['max_date'].dt.strftime('%Y-%B'))) + """
                </div>
                <div class="label">
                latest date for all countries
                </div>
            </div>
            <div class="grey statistic">
                <div class="value">Twh
                </div>
                <div class="label">
                Unit
                </div>
            </div>
        </div>"""

    table_scorecard += """<br><br><br><div id="mydiv" class="ui centered cards">"""

    for index, row in df.iterrows():
        table_scorecard += f"""
    <div class="card">
        <div class="content" style="background-color: {header_bg(row['type'])};">
            <div class="header smallheader">{row['country']}</div>
            <div class="meta smallheader">{row['continent']}</div>
        </div>
        <div class="content">
            <div class="column kpi number">
                {round(row['year_to_date_sum'], 2)}<br>
                <p class="kpi text">Year-to-Date (YTD)</p>
            </div>
            <div class="column kpi number">
                {row['percentage_change']:.2f}%<br>
                <p class="kpi text">YTD YoY Change</p>
            </div>
        </div>
        <div class="extra content">
            <div class="meta"><i class="user icon"></i>Source: <a href="{row['source_url']}" target="_blank">{row['source']}</a> </div>
            <div class="meta"><i class="calendar alternate outline icon"></i> Updated to: {row['max_date'].strftime("%Y-%m-%d")}</div>
        </div>
    </div>"""

    return table_scorecard


if __name__ == '__main__':
    with st.spinner('Loading page...'):
        main()
